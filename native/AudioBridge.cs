using System;using System.IO;using System.Text;using System.Threading;using System.Diagnostics;using System.Runtime.InteropServices;
using System.Net;
using System.Net.Sockets;
using System.Globalization;
[ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]class MMEnumerator{}
[ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IMMDeviceEnumerator{void EnumAudioEndpoints(int flow,uint mask,out IMMDeviceCollection devices);void GetDefaultAudioEndpoint(int flow,int role,out IMMDevice device);void GetDevice([MarshalAs(UnmanagedType.LPWStr)]string id,out IMMDevice device);void RegisterEndpointNotificationCallback(IntPtr p);void UnregisterEndpointNotificationCallback(IntPtr p);}
[ComImport,Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IMMDeviceCollection{void GetCount(out uint count);void Item(uint index,out IMMDevice device);}
[ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IMMDevice{void Activate(ref Guid iid,uint clsctx,IntPtr p,[MarshalAs(UnmanagedType.IUnknown)]out object obj);void OpenPropertyStore(uint access,out IPropertyStore store);void GetId([MarshalAs(UnmanagedType.LPWStr)]out string id);void GetState(out uint state);}
[StructLayout(LayoutKind.Sequential)]struct PropertyKey{public Guid fmtid;public uint pid;}
[StructLayout(LayoutKind.Explicit,Size=24)]struct PropVariant{[FieldOffset(0)]public ushort type;[FieldOffset(8)]public IntPtr ptr;}
[ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IPropertyStore{void GetCount(out uint count);void GetAt(uint index,out PropertyKey key);void GetValue(ref PropertyKey key,out PropVariant value);void SetValue(ref PropertyKey key,ref PropVariant value);void Commit();}
[ComImport,Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IAudioClient{
 void Initialize(int mode,uint flags,long duration,long periodicity,IntPtr format,IntPtr session);void GetBufferSize(out uint frames);void GetStreamLatency(out long latency);void GetCurrentPadding(out uint padding);void IsFormatSupported(int mode,IntPtr format,out IntPtr closest);void GetMixFormat(out IntPtr format);void GetDevicePeriod(out long def,out long min);void Start();void Stop();void Reset();void SetEventHandle(IntPtr e);void GetService(ref Guid iid,[MarshalAs(UnmanagedType.IUnknown)]out object obj);
}
[ComImport,Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IAudioCaptureClient{void GetBuffer(out IntPtr data,out uint frames,out uint flags,out ulong position,out ulong qpc);void ReleaseBuffer(uint frames);void GetNextPacketSize(out uint frames);}
class AudioBridge{
 [DllImport("ole32.dll")]static extern int PropVariantClear(ref PropVariant value);
 static string Json(string s){return "\""+s.Replace("\\","\\\\").Replace("\"","\\\"").Replace("\r","\\r").Replace("\n","\\n")+"\"";}
 static string DeviceId(IMMDevice d){string id;d.GetId(out id);return id;}
 static string Name(IMMDevice d){IPropertyStore store;d.OpenPropertyStore(0,out store);var key=new PropertyKey{fmtid=new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"),pid=14};PropVariant val;store.GetValue(ref key,out val);string name=Marshal.PtrToStringUni(val.ptr)??"Audio device";PropVariantClear(ref val);Marshal.ReleaseComObject(store);return name;}
 static void List(IMMDeviceEnumerator e){Console.OutputEncoding=new UTF8Encoding(false);var list=new System.Collections.Generic.List<string>();for(int flow=0;flow<2;flow++){string def="";try{IMMDevice d;e.GetDefaultAudioEndpoint(flow,1,out d);def=DeviceId(d);Marshal.ReleaseComObject(d);}catch{}IMMDeviceCollection c;e.EnumAudioEndpoints(flow,1,out c);uint count;c.GetCount(out count);for(uint i=0;i<count;i++){IMMDevice d;c.Item(i,out d);string id=DeviceId(d);list.Add("{\"id\":"+Json(id)+",\"name\":"+Json(Name(d))+",\"flow\":"+Json(flow==0?"output":"input")+",\"isDefault\":"+(id==def?"true":"false")+"}");Marshal.ReleaseComObject(d);}Marshal.ReleaseComObject(c);}Console.Write("["+string.Join(",",list.ToArray())+"]");}
 static void Capture(IMMDeviceEnumerator e,string id,int flow,double epoch,Stream output){IMMDevice device;if(id=="default")e.GetDefaultAudioEndpoint(flow,1,out device);else e.GetDevice(id,out device);var iid=new Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2");object o;device.Activate(ref iid,23,IntPtr.Zero,out o);var client=(IAudioClient)o;
  IntPtr format=Marshal.AllocHGlobal(18);byte[] fmt=new byte[18];using(var ms=new MemoryStream(fmt))using(var bw=new BinaryWriter(ms)){bw.Write((ushort)3);bw.Write((ushort)2);bw.Write(48000);bw.Write(384000);bw.Write((ushort)8);bw.Write((ushort)32);bw.Write((ushort)0);}Marshal.Copy(fmt,0,format,18);
  // A one-second shared-mode ring absorbs scheduling spikes during replay saves.
  try { client.Initialize(0,0x80000000u|0x08000000u|(flow==0?0x00020000u:0),10000000,0,format,IntPtr.Zero); }
  finally { Marshal.FreeHGlobal(format); }
  iid=new Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317");client.GetService(ref iid,out o);var capture=(IAudioCaptureClient)o;
  long period,minPeriod;client.GetDevicePeriod(out period,out minPeriod);
  double elapsed=epoch>0?((DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds-epoch)/1000.0:0;
  double start=(double)Stopwatch.GetTimestamp()/Stopwatch.Frequency-elapsed;
  Func<long> now=()=> (long)(((double)Stopwatch.GetTimestamp()/Stopwatch.Frequency-start)*48000);
  using(var writer=new AudioPcmWriter(output)) {
   var timeline=new AudioTimeline(writer.Enqueue,(int)Math.Ceiling(period*48000.0/10000000));
   client.Start();
   try {
    while(true) {
     writer.Check();uint packet;capture.GetNextPacketSize(out packet);
     while(packet>0) {
      IntPtr data;uint frames,flags;ulong pos,qpc;
      capture.GetBuffer(out data,out frames,out flags,out pos,out qpc);
      byte[] bytes;
      // Copy and release BEFORE timing, mixing, or writing anything to a pipe.
      try { bytes=new byte[checked((int)frames*8)];if((flags&2)==0&&frames>0)Marshal.Copy(data,bytes,0,bytes.Length); }
      finally { capture.ReleaseBuffer(frames); }
      long first=qpc==0?-1:(long)Math.Round(((double)qpc/10000000.0-start)*48000);
      timeline.Packet(bytes,flags,first,now());
      capture.GetNextPacketSize(out packet);
     }
     timeline.Idle(now());Thread.Sleep(5);
    }
   } finally { client.Stop(); }
  }
 }
 static void CaptureMany(string[] args) {
  int count=(args.Length-2)/2;
  if(count<1||count>8||args.Length!=2+count*2)throw new ArgumentException("Invalid audio sources");
  double epoch=double.Parse(args[1],CultureInfo.InvariantCulture);
  var listeners=new TcpListener[count];
  var ports=new string[count];
  var failed=new ManualResetEvent(false);
  try {
   for(int i=0;i<count;i++) {
    listeners[i]=new TcpListener(IPAddress.Loopback,0);
    listeners[i].ExclusiveAddressUse=true;
    listeners[i].Start(1);
    ports[i]=((IPEndPoint)listeners[i].LocalEndpoint).Port.ToString(CultureInfo.InvariantCulture);
   }
   for(int i=0;i<count;i++) {
    int index=i;
    var captureThread=new Thread(delegate() {
     try {
      using(TcpClient connection=listeners[index].AcceptTcpClient()) {
       listeners[index].Stop();
       connection.SendTimeout=5000;
       Capture((IMMDeviceEnumerator)new MMEnumerator(),args[2+index*2],args[3+index*2]=="output"?0:1,epoch,connection.GetStream());
      }
     } catch(Exception error) {
      Console.Error.WriteLine("Audio source "+(index+1)+": "+error.Message+" (0x"+error.HResult.ToString("X")+")");
      failed.Set();
     }
    });
    captureThread.IsBackground=true;
    captureThread.SetApartmentState(ApartmentState.STA);
    captureThread.Start();
   }
   Console.WriteLine("["+string.Join(",",ports)+"]");
   failed.WaitOne();
   throw new IOException("Audio capture stopped");
  } finally {
   foreach(var listener in listeners)if(listener!=null)listener.Stop();
  }
 }
 [STAThread]static int Main(string[] args){try{if(args.Length>0&&args[0]=="capture-many")CaptureMany(args);else {var e=(IMMDeviceEnumerator)new MMEnumerator();if(args.Length==0||args[0]=="list")List(e);else if(args[0]=="capture"&&args.Length>=3)Capture(e,args[1],args[2]=="output"?0:1,args.Length>3?double.Parse(args[3],CultureInfo.InvariantCulture):0,Console.OpenStandardOutput());else throw new Exception("Invalid audio command");}return 0;}catch(Exception ex){Console.Error.WriteLine(ex.Message+" (0x"+ex.HResult.ToString("X")+")");return 1;}}
}
