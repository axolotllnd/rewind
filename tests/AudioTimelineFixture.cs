using System;
using System.IO;
using System.Threading;

class AudioTimelineFixture {
 static void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
 static byte[] Tone(int first, int count) {
  byte[] bytes=new byte[count*8];
  for(int i=0;i<count;i++) {
   float value=(float)(.9*Math.Sin(2*Math.PI*997*(first+i)/48000.0));
   Buffer.BlockCopy(BitConverter.GetBytes(value),0,bytes,i*8,4);
   Buffer.BlockCopy(BitConverter.GetBytes(value),0,bytes,i*8+4,4);
  }
  return bytes;
 }
 static void Equal(byte[] a, byte[] b, string message) {
  Check(a.Length==b.Length,message+" length "+a.Length+" != "+b.Length);
  for(int i=0;i<a.Length;i++)Check(a[i]==b[i],message+" byte "+i);
 }
 sealed class SlowPipe : MemoryStream {
  internal readonly ManualResetEvent Entered=new ManualResetEvent(false),Release=new ManualResetEvent(false);
  public override void Write(byte[] bytes,int offset,int count) {
   Entered.Set();Release.WaitOne();base.Write(bytes,offset,count);
  }
 }
 static void Jitter() {
  var output=new MemoryStream();var timeline=new AudioTimeline(b=>output.Write(b,0,b.Length),480);
  // Alternating sub-frame jitter used to insert zeros and discard real samples
  // on every other WASAPI packet. Preserve a 10-second loud waveform exactly.
  for(int p=0;p<1000;p++) {
   int frame=p*480;
   timeline.Packet(Tone(frame,480),0,Math.Max(0,frame+(p%2==0?0:1)),frame+480);
   timeline.Idle(frame+480);
  }
  Equal(output.ToArray(),Tone(0,480000),"jitter changed PCM");
  // Reproduce the previous per-packet timestamp splice and prove this fixture
  // actually exposes the audible regression, rather than only counting bytes.
  var old=new MemoryStream();long written=0;
  for(int p=0;p<1000;p++) {
   int first=p*480+(p%2==0?0:1);byte[] packet=Tone(p*480,480);
   while(written<first) { old.Write(new byte[8],0,8);written++; }
   int skip=(int)Math.Min(480,Math.Max(0,written-first));
   old.Write(packet,skip*8,packet.Length-skip*8);written+=480-skip;
  }
  byte[] broken=old.ToArray(),reference=Tone(0,480000);double peakError=0;
  for(int i=0;i<Math.Min(broken.Length,reference.Length);i+=4)
   peakError=Math.Max(peakError,Math.Abs(BitConverter.ToSingle(broken,i)-BitConverter.ToSingle(reference,i)));
  Check(peakError>.5,"fixture did not reproduce the old crackle");
  Console.WriteLine("JITTER_BIT_EXACT_OK");
 }
 static void Invalid() {
  var output=new MemoryStream();var timeline=new AudioTimeline(b=>output.Write(b,0,b.Length),480);
  for(int p=0;p<200;p++)timeline.Packet(Tone(p*480,480),p==0?0u:4u,p==0?0:(p%2==0?0:long.MaxValue),p*480+480);
  Equal(output.ToArray(),Tone(0,96000),"invalid timestamps cut samples");
  Console.WriteLine("INVALID_TIMESTAMP_OK");
 }
 static void ClockDrift() {
  foreach(int direction in new int[]{-1,1}) {
   var output=new MemoryStream();var timeline=new AudioTimeline(b=>output.Write(b,0,b.Length),480);
   for(int p=0;p<2000;p++) {
    int timestamp=(int)Math.Round(p*480*(1+direction*.0008));
    timeline.Packet(Tone(p*480,480),0,timestamp,timestamp+480);
   }
   Check(Math.Abs(timeline.Written-2000*480*(1+direction*.0008))<100,"long recording drifts away from video");
   byte[] pcm=output.ToArray();
   for(int i=8;i<pcm.Length;i+=8)
    Check(Math.Abs(BitConverter.ToSingle(pcm,i)-BitConverter.ToSingle(pcm,i-8))<.14,"hard sample splice during clock correction");
  }
  Console.WriteLine("CLOCK_DRIFT_OK");
 }
 static void DelayAndSilence() {
  var output=new MemoryStream();var timeline=new AudioTimeline(b=>output.Write(b,0,b.Length),480);
  timeline.Packet(Tone(0,480),0,0,480);
  timeline.Idle(6000); // 115 ms scheduler delay must not preempt the next packet.
  timeline.Packet(Tone(480,480),0,480,6000);
  Equal(output.ToArray(),Tone(0,960),"scheduler delay replaced real audio");
  timeline.Idle(48000);Check(timeline.Written==36000,"silence clock lost common epoch");
  timeline.Packet(Tone(48000,480),1,48000,48480);
  Check(timeline.Written==48480,"recovered packet misaligned");
  byte[] pcm=output.ToArray();
  for(int i=8;i<pcm.Length;i+=8)
   Check(Math.Abs(BitConverter.ToSingle(pcm,i)-BitConverter.ToSingle(pcm,i-8))<.14,"click at silence/recovery boundary");
  for(int i=48000;i<48000+240;i++) {
   float expected=BitConverter.ToSingle(Tone(i,1),0)*(i-48000)/240f;
   Check(Math.Abs(BitConverter.ToSingle(pcm,i*8)-expected)<.000001,"gap recovery lacks fade");
  }
  // A paused endpoint still advances each track, including before its first packet.
  var startup=new AudioTimeline(b=>{},480);startup.Idle(48000);
  Check(startup.Written==36000,"startup silence missing");
  Console.WriteLine("DELAY_AND_GAP_OK");
 }
 static void Backpressure() {
  var pipe=new SlowPipe();var writer=new AudioPcmWriter(pipe);
  byte[] tone=Tone(0,480);writer.Enqueue(tone);
  Check(pipe.Entered.WaitOne(1000),"writer did not start");
  try {
   for(int i=0;i<200;i++)writer.Enqueue(tone);
   Check(pipe.Length==0,"fake pipe did not block");
  } finally { pipe.Release.Set();writer.Dispose(); }
  Check(pipe.Length==tone.Length*201,"queued audio lost under backpressure");
  // Persistent overload is bounded and explicit, never silent packet dropping.
  pipe=new SlowPipe();writer=new AudioPcmWriter(pipe);bool bounded=false;
  try { for(int i=0;i<600;i++)writer.Enqueue(tone); }
  catch(IOException) { bounded=true; }
  finally { pipe.Release.Set();writer.Dispose(); }
  Check(bounded,"PCM queue grew without a bound");
  Console.WriteLine("BACKPRESSURE_OK");
 }
 static int Main() {
  try { Jitter();Invalid();ClockDrift();DelayAndSilence();Backpressure();return 0; }
  catch(Exception error) { Console.Error.WriteLine(error);return 1; }
 }
}
