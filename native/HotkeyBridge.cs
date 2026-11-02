using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

class Binding { public string action {get;set;} public int key {get;set;} public int modifiers {get;set;} }
class PressMatcher {
 readonly HashSet<int> held=new HashSet<int>();
 public string Match(Binding[] bindings,int key,int modifiers,bool down){if(!down){held.Remove(key);return null;}if(!held.Add(key))return null;foreach(var binding in bindings)if(binding.key==key&&binding.modifiers==modifiers)return binding.action;return null;}
 public void ReleaseInactive(Func<int,bool> isDown){held.RemoveWhere(key=>!isDown(key));}
 public void Clear(){held.Clear();}
}
class RawKeyMatcher {
 readonly HashSet<int> modifiers=new HashSet<int>();readonly PressMatcher presses=new PressMatcher();
 public static int Normalize(int key,int scan,int flags){if(key==0x10)return scan==0x36?0xA1:0xA0;if(key==0x11)return (flags&2)!=0?0xA3:0xA2;if(key==0x12)return (flags&2)!=0?0xA5:0xA4;return key;}
 public int Modifiers {get{return ((modifiers.Contains(0xA2)||modifiers.Contains(0xA3))?1:0)|((modifiers.Contains(0xA4)||modifiers.Contains(0xA5))?2:0)|((modifiers.Contains(0xA0)||modifiers.Contains(0xA1))?4:0)|((modifiers.Contains(0x5B)||modifiers.Contains(0x5C))?8:0);}}
 public string Match(Binding[] bindings,int key,bool down){if((key>=0xA0&&key<=0xA5)||key==0x5B||key==0x5C){if(down)modifiers.Add(key);else modifiers.Remove(key);return null;}return presses.Match(bindings,key,Modifiers,down);}
 public void ReleaseInactive(Func<int,bool> isDown){modifiers.RemoveWhere(key=>!isDown(key));presses.ReleaseInactive(isDown);}
 public void SeedModifiers(Func<int,bool> isDown){foreach(int key in new[]{0xA0,0xA1,0xA2,0xA3,0xA4,0xA5,0x5B,0x5C})if(isDown(key))modifiers.Add(key);}
 public void Clear(){modifiers.Clear();presses.Clear();}
}
class HotkeyBridge {
 [StructLayout(LayoutKind.Sequential)]struct RawDevice {public ushort usagePage,usage;public uint flags;public IntPtr target;}
 [StructLayout(LayoutKind.Sequential)]struct RawHeader {public uint type,size;public IntPtr device,parameter;}
 [StructLayout(LayoutKind.Sequential)]struct RawKeyboard {public ushort scan,flags,reserved,key;public uint message,extra;}
 [DllImport("user32.dll",SetLastError=true)]static extern bool RegisterRawInputDevices(RawDevice[] devices,uint count,uint size);
 [DllImport("user32.dll",SetLastError=true)]static extern uint GetRawInputData(IntPtr input,uint command,IntPtr data,ref uint size,uint headerSize);
 [DllImport("user32.dll")]static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")]static extern bool PostThreadMessage(uint thread,uint message,IntPtr wp,IntPtr lp);
 [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
 static volatile Binding[] bindings=new Binding[0];static readonly RawKeyMatcher matcher=new RawKeyMatcher();static uint threadId;
 static bool Down(int key){return (GetAsyncKeyState(key)&0x8000)!=0;}
 static bool ReadKeyboard(IntPtr data,uint size,out RawKeyboard keyboard){keyboard=new RawKeyboard();int headerSize=Marshal.SizeOf(typeof(RawHeader));if(size<headerSize+Marshal.SizeOf(typeof(RawKeyboard)))return false;var header=(RawHeader)Marshal.PtrToStructure(data,typeof(RawHeader));if(header.type!=1||header.size>size)return false;keyboard=(RawKeyboard)Marshal.PtrToStructure(IntPtr.Add(data,headerSize),typeof(RawKeyboard));return keyboard.key<255&&keyboard.scan!=0xFF;}
 static void Press(string action,int key){Console.WriteLine("{\"type\":\"press\",\"action\":\""+action+"\",\"key\":"+key+",\"modifiers\":"+matcher.Modifiers+",\"at\":"+(long)(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds+"}");}
 sealed class InputWindow:NativeWindow,IDisposable {
  readonly uint headerSize=(uint)Marshal.SizeOf(typeof(RawHeader));IntPtr buffer;uint bufferSize;
  public InputWindow(){
   CreateHandle(new CreateParams{Caption="REWIND shortcut input",Parent=new IntPtr(-3)});
   // RAWINPUT includes a union and may be larger than header + RAWKEYBOARD.
   bufferSize=4096;buffer=Marshal.AllocHGlobal((int)bufferSize);
   // INPUTSINK also works when the foreground game uses Raw Input. Do not use
   // EXINPUTSINK, NOLEGACY or NOHOTKEYS: other apps must keep receiving their keys.
   if(!RegisterRawInputDevices(new[]{new RawDevice{usagePage=1,usage=6,flags=0x100|0x2000,target=Handle}},1,(uint)Marshal.SizeOf(typeof(RawDevice))))throw new System.ComponentModel.Win32Exception();
  }
  protected override void WndProc(ref Message message){
   if(message.Msg==0xFF&&buffer!=IntPtr.Zero){
    uint size=bufferSize;uint received=GetRawInputData(message.LParam,0x10000003,buffer,ref size,headerSize);
    RawKeyboard key;if(received!=uint.MaxValue&&received<=bufferSize&&ReadKeyboard(buffer,received,out key)){int normalized=RawKeyMatcher.Normalize(key.key,key.scan,key.flags);string action=matcher.Match(bindings,normalized,(key.flags&1)==0);if(action!=null)Press(action,key.key);}
   }else if(message.Msg==0xFE){matcher.Clear();matcher.SeedModifiers(Down);}
   // DefWindowProc performs WM_INPUT cleanup. Never inject or consume keys.
   base.WndProc(ref message);
  }
  public void Dispose(){RegisterRawInputDevices(new[]{new RawDevice{usagePage=1,usage=6,flags=1,target=IntPtr.Zero}},1,(uint)Marshal.SizeOf(typeof(RawDevice)));DestroyHandle();if(buffer!=IntPtr.Zero){Marshal.FreeHGlobal(buffer);buffer=IntPtr.Zero;}}
 }
 static void ReadConfig(){try{string line;var json=new JavaScriptSerializer();while((line=Console.ReadLine())!=null){try{var next=json.Deserialize<Binding[]>(line);if(next==null||next.Length>3)continue;var keys=new HashSet<string>();bool valid=true;foreach(var b in next){if(!new List<string>{"replay","record","toggle"}.Contains(b.action)||b.key<1||b.key>254||b.modifiers<1||b.modifiers>15||!keys.Add(b.key+":"+b.modifiers))valid=false;}if(valid)bindings=next;}catch{}}}finally{PostThreadMessage(threadId,0x12,IntPtr.Zero,IntPtr.Zero);}}
 static void SelfTest(){
  var b=new[]{new Binding{action="replay",key=121,modifiers=2},new Binding{action="toggle",key=121,modifiers=6}};var m=new PressMatcher();
  if(m.Match(b,121,2,true)!="replay"||m.Match(b,121,2,true)!=null)throw new Exception("Repeat handling");m.Match(b,121,2,false);if(m.Match(b,121,6,true)!="toggle")throw new Exception("Exact modifiers");m.Match(b,121,6,false);if(m.Match(b,121,3,true)!=null)throw new Exception("Extra modifiers");
  var raw=new RawKeyMatcher();raw.Match(b,0xA4,true);if(raw.Match(b,121,true)!="replay"||raw.Match(b,121,true)!=null)throw new Exception("Raw Alt+F10/repeat");raw.Match(b,121,false);raw.Match(b,0xA5,true);raw.Match(b,0xA4,false);if(raw.Match(b,121,true)!="replay")throw new Exception("Right Alt remains held");raw.Match(b,121,false);raw.Match(b,0xA0,true);if(raw.Match(b,121,true)!="toggle")throw new Exception("Raw exact modifiers");raw.Match(b,121,false);raw.Match(b,0xA2,true);if(raw.Match(b,121,true)!=null)throw new Exception("Raw extra modifiers");raw.ReleaseInactive(key=>false);raw.Match(b,0xA4,true);if(raw.Match(b,121,true)!="replay")throw new Exception("Missing key-up recovery");
  if(RawKeyMatcher.Normalize(0x12,0x38,2)!=0xA5||RawKeyMatcher.Normalize(0x11,0x1D,0)!=0xA2||RawKeyMatcher.Normalize(0x10,0x36,0)!=0xA1)throw new Exception("Modifier normalization");if(Marshal.SizeOf(typeof(RawHeader))!=24||Marshal.SizeOf(typeof(RawKeyboard))!=16||Marshal.SizeOf(typeof(RawDevice))!=16)throw new Exception("Raw input x64 layout");
  IntPtr packet=Marshal.AllocHGlobal(48);try{Marshal.StructureToPtr(new RawHeader{type=1,size=48},packet,false);Marshal.StructureToPtr(new RawKeyboard{key=121,scan=0x44},IntPtr.Add(packet,24),false);RawKeyboard decoded;if(!ReadKeyboard(packet,48,out decoded)||decoded.key!=121||ReadKeyboard(packet,39,out decoded))throw new Exception("Raw keyboard packet");Marshal.StructureToPtr(new RawHeader{type=0,size=48},packet,false);if(ReadKeyboard(packet,48,out decoded))throw new Exception("Non-keyboard packet");}finally{Marshal.FreeHGlobal(packet);}
  Console.WriteLine("HOTKEY_MATCHER_OK RAW_INPUT_MATCHER_OK");
 }
 [STAThread]static int Main(string[] args){try{
  if(args.Length>0&&args[0]=="--self-test"){SelfTest();return 0;}threadId=GetCurrentThreadId();
  using(var window=new InputWindow())using(var timer=new System.Windows.Forms.Timer()){matcher.SeedModifiers(Down);timer.Interval=250;timer.Tick+=(sender,e)=>matcher.ReleaseInactive(Down);timer.Start();var input=new Thread(ReadConfig);input.IsBackground=true;input.Start();Console.WriteLine("{\"type\":\"ready\",\"backend\":\"raw-input\"}");Application.Run();}return 0;
 }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}}
}
