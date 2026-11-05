using System;
using System.IO;
using System.Threading;
using System.Collections.Concurrent;

// WASAPI packet timestamps may jitter or be explicitly marked invalid. Never
// splice individual samples to chase that jitter: PCM packets are continuous.
internal sealed class AudioTimeline {
 internal const int Rate = 48000, FrameBytes = 8, FadeFrames = 240;
 internal const int IdleFrames = Rate / 4;
 readonly Action<byte[]> emit;
 readonly int gapThreshold;
 bool hasPacket, padded, fadeIn;
 long lastArrival;
 float left, right;
 internal long Written { get; private set; }
 internal AudioTimeline(Action<byte[]> emit, int periodFrames) {
  this.emit = emit;
  gapThreshold = Math.Max(Rate / 10, periodFrames * 2);
 }
 void Write(byte[] bytes) {
  if (bytes.Length == 0) return;
  emit(bytes); Written += bytes.Length / FrameBytes;
  left = BitConverter.ToSingle(bytes, bytes.Length - 8);
  right = BitConverter.ToSingle(bytes, bytes.Length - 4);
 }
 static void Sample(byte[] bytes, int offset, float value) {
  byte[] sample = BitConverter.GetBytes(value);
  Buffer.BlockCopy(sample, 0, bytes, offset, 4);
 }
 static byte[] Resample(byte[] bytes, int frames) {
  int original = bytes.Length / FrameBytes;
  byte[] result = new byte[frames * FrameBytes];
  for (int i = 0; i < frames; i++) {
   double at = i * (original - 1.0) / (frames - 1);
   int a = (int)at, b = Math.Min(a + 1, original - 1);
   float fraction = (float)(at - a);
   for (int channel = 0; channel < 2; channel++) {
    float left = BitConverter.ToSingle(bytes, a * 8 + channel * 4);
    float right = BitConverter.ToSingle(bytes, b * 8 + channel * 4);
    Sample(result, i * 8 + channel * 4, left + (right - left) * fraction);
   }
  }
  return result;
 }
 void Silence(long frames) {
  if (frames <= 0) return;
  int ramp = (int)Math.Min(FadeFrames, frames);
  if (left != 0 || right != 0) {
   byte[] tail = new byte[ramp * FrameBytes];
   for (int i = 0; i < ramp; i++) {
    float gain = (ramp - 1 - i) / (float)ramp;
    Sample(tail, i * 8, left * gain); Sample(tail, i * 8 + 4, right * gain);
   }
   Write(tail); frames -= ramp;
  }
  while (frames > 0) {
   int n = (int)Math.Min(frames, 4800);
   Write(new byte[n * FrameBytes]); frames -= n;
  }
  padded = true; fadeIn = true;
 }
 internal void Packet(byte[] bytes, uint flags, long timestampFrame, long arrivalFrame) {
  int frames = bytes.Length / FrameBytes;
  if (frames == 0) return;
  // TIMESTAMP_ERROR means neither the QPC timestamp nor the device position
  // can safely be used to cut samples from a healthy stream.
  bool valid = (flags & 4) == 0 && timestampFrame >= 0 && timestampFrame <= arrivalFrame + Rate / 10;
  long drift = timestampFrame - Written;
  // Hardware and system clocks can slowly diverge. Beyond 2 ms, stretch or
  // compress by at most one frame per packet instead of inserting zeroes or
  // abruptly dropping samples. Genuine gaps follow the recovery path below.
  if (valid && hasPacket && !padded && (flags & 3) == 0 && frames > 2 &&
      Math.Abs(drift) > Rate / 500 && Math.Abs(drift) < gapThreshold) {
   frames += Math.Sign(drift); bytes = Resample(bytes, frames);
  }
  long first = Written;
  if (valid && (!hasPacket || padded ||
      ((flags & 1) != 0 && Math.Abs(timestampFrame - Written) > FadeFrames) ||
      timestampFrame - Written > gapThreshold)) first = timestampFrame;
  else if (!hasPacket) first = Math.Max(Written, arrivalFrame - frames);
  if (first > Written) Silence(first - Written);
  int skip = (int)Math.Min(frames, Math.Max(0, Written - first));
  hasPacket = true; lastArrival = arrivalFrame;
  if (skip == frames) return;
  if (skip != 0) {
   byte[] remainder = new byte[(frames - skip) * FrameBytes];
   Buffer.BlockCopy(bytes, skip * FrameBytes, remainder, 0, remainder.Length);
   bytes = remainder;
  }
  if ((flags & 2) != 0) { Silence(bytes.Length / FrameBytes); return; }
  if (fadeIn) {
   int n = Math.Min(FadeFrames, bytes.Length / FrameBytes);
   for (int i = 0; i < n; i++) {
    float gain = i / (float)n;
    Sample(bytes, i * 8, BitConverter.ToSingle(bytes, i * 8) * gain);
    Sample(bytes, i * 8 + 4, BitConverter.ToSingle(bytes, i * 8 + 4) * gain);
   }
  }
  Write(bytes); padded = false; fadeIn = false;
 }
 internal void Idle(long nowFrame) {
  // Do not fabricate silence while a delayed real packet can still arrive.
  if (hasPacket && nowFrame - lastArrival < IdleFrames) return;
  Silence(nowFrame - IdleFrames - Written);
 }
}

// Pipe/disk backpressure must never hold a Windows capture packet. The capture
// loop only copies and releases it, then queues PCM for this independent writer.
internal sealed class AudioPcmWriter : IDisposable {
 readonly BlockingCollection<byte[]> queue = new BlockingCollection<byte[]>();
 readonly Thread thread;
 long pending;
 Exception failure;
 internal AudioPcmWriter(Stream output) {
  thread = new Thread(delegate() {
   try { foreach (byte[] bytes in queue.GetConsumingEnumerable()) {
    output.Write(bytes, 0, bytes.Length); Interlocked.Add(ref pending, -bytes.Length);
   } } catch (Exception error) { Interlocked.CompareExchange(ref failure, error, null); }
  });
  thread.IsBackground = true; thread.Name = "REWIND PCM writer"; thread.Start();
 }
 internal void Check() {
  Exception error = Interlocked.CompareExchange(ref failure, null, null);
  if (error != null) throw new IOException("Audio pipe failed", error);
 }
 internal void Enqueue(byte[] bytes) {
  Check();
  // Five seconds of stereo float PCM, bounded independently of packet sizes.
  if (Interlocked.Add(ref pending, bytes.Length) > 5L * AudioTimeline.Rate * AudioTimeline.FrameBytes) {
   Interlocked.Add(ref pending, -bytes.Length);
   throw new IOException("Audio encoding cannot keep up with capture");
  }
  queue.Add(bytes);
 }
 public void Dispose() {
  queue.CompleteAdding();
  if (thread.Join(2000)) queue.Dispose();
 }
}
