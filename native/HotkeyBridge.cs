using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
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
 readonly HashSet<int> modifiers=new HashSet<int>();readonly PressMatcher presses=new PressMatcher();public int LastModifiers {get;private set;}
 public static int Normalize(int key,int scan,int flags){if(key==0x10)return scan==0x36?0xA1:0xA0;if(key==0x11)return (flags&2)!=0?0xA3:0xA2;if(key==0x12)return (flags&2)!=0?0xA5:0xA4;return key;}
 public int Modifiers {get{return ((modifiers.Contains(0xA2)||modifiers.Contains(0xA3))?1:0)|((modifiers.Contains(0xA4)||modifiers.Contains(0xA5))?2:0)|((modifiers.Contains(0xA0)||modifiers.Contains(0xA1))?4:0)|((modifiers.Contains(0x5B)||modifiers.Contains(0x5C))?8:0);}}
 public string Match(Binding[] bindings,int key,bool down,bool? altContext=null){if((key>=0xA0&&key<=0xA5)||key==0x5B||key==0x5C){if(down)modifiers.Add(key);else modifiers.Remove(key);return null;}LastModifiers=altContext.HasValue?((Modifiers&~2)|(altContext.Value?2:0)):Modifiers;return presses.Match(bindings,key,LastModifiers,down);}
 public void ReleaseInactive(Func<int,bool> isDown){modifiers.RemoveWhere(key=>!isDown(key));presses.ReleaseInactive(isDown);}
 public void SeedModifiers(Func<int,bool> isDown){foreach(int key in new[]{0xA0,0xA1,0xA2,0xA3,0xA4,0xA5,0x5B,0x5C})if(isDown(key))modifiers.Add(key);}
 public void Clear(){modifiers.Clear();presses.Clear();}
}
class ObservedPress {public string action,method;public int key,modifiers;public long at;}
class ConfiguredKeyPoller {
 Binding[] previous;PressMatcher presses=new PressMatcher();readonly List<int> keys=new List<int>();
 static int Modifiers(Func<int,bool> down){return ((down(0xA2)||down(0xA3))?1:0)|((down(0xA4)||down(0xA5))?2:0)|((down(0xA0)||down(0xA1))?4:0)|((down(0x5B)||down(0x5C))?8:0);}
 public void Tick(Binding[] bindings,Func<int,bool> down,long at,Action<ObservedPress> emit){
  if(!Object.ReferenceEquals(previous,bindings)){previous=bindings;presses=new PressMatcher();keys.Clear();foreach(var b in bindings)if(!keys.Contains(b.key))keys.Add(b.key);foreach(int key in keys)presses.Match(new Binding[0],key,0,down(key));return;}
  int modifiers=-1;foreach(int key in keys){bool held=down(key);if(held&&modifiers<0)modifiers=Modifiers(down);string action=presses.Match(bindings,key,held?modifiers:0,held);if(action!=null)emit(new ObservedPress{action=action,key=key,modifiers=modifiers,method="poll",at=at});}
 }
}
class PressPairMatcher {
 class Group {public ObservedPress press;public readonly HashSet<string> methods=new HashSet<string>();}
 readonly List<Group> groups=new List<Group>();
 public bool Accept(ObservedPress press){groups.RemoveAll(g=>Math.Abs(press.at-g.press.at)>150);var group=groups.Find(g=>g.press.action==press.action&&g.press.key==press.key&&g.press.modifiers==press.modifiers&&!g.methods.Contains(press.method));if(group!=null){group.methods.Add(press.method);return false;}group=new Group{press=press};group.methods.Add(press.method);groups.Add(group);if(groups.Count>24)groups.RemoveAt(0);return true;}
}
class HotkeyBridge {
 delegate IntPtr HookProc(int code,IntPtr message,IntPtr data);
 [StructLayout(LayoutKind.Sequential)]struct HookKey {public uint key,scan,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)]struct RawDevice {public ushort usagePage,usage;public uint flags;public IntPtr target;}
 [StructLayout(LayoutKind.Sequential)]struct RawHeader {public uint type,size;public IntPtr device,parameter;}
 [StructLayout(LayoutKind.Sequential)]struct RawKeyboard {public ushort scan,flags,reserved,key;public uint message,extra;}
 [DllImport("user32.dll",SetLastError=true)]static extern bool RegisterRawInputDevices(RawDevice[] devices,uint count,uint size);
 [DllImport("user32.dll",SetLastError=true)]static extern uint GetRawInputData(IntPtr input,uint command,IntPtr data,ref uint size,uint headerSize);
 [DllImport("user32.dll")]static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")]static extern bool PostThreadMessage(uint thread,uint message,IntPtr wp,IntPtr lp);
 [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr GetModuleHandle(string name);
 [DllImport("user32.dll",SetLastError=true)]static extern IntPtr SetWindowsHookEx(int type,HookProc callback,IntPtr module,uint thread);
 [DllImport("user32.dll")]static extern bool UnhookWindowsHookEx(IntPtr handle);
 [DllImport("user32.dll")]static extern IntPtr CallNextHookEx(IntPtr handle,int code,IntPtr message,IntPtr data);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 static volatile Binding[] bindings=new Binding[0];static readonly RawKeyMatcher matcher=new RawKeyMatcher(),hookMatcher=new RawKeyMatcher();static readonly BlockingCollection<ObservedPress> output=new BlockingCollection<ObservedPress>(256);static readonly HookProc callback=OnKey;static IntPtr hook,foreground;static int lastHookAt;static uint threadId;static bool diagnostic;static volatile bool stopping;static int rawMessages,readErrors,altMake,altBreak,f10Make,f10Break,hookF10Make,hookF10Break,matches,ticks;
 static bool Down(int key){return (GetAsyncKeyState(key)&0x8000)!=0;}
 static bool ReadKeyboard(IntPtr data,uint size,out RawKeyboard keyboard){keyboard=new RawKeyboard();int headerSize=Marshal.SizeOf(typeof(RawHeader));if(size<headerSize+Marshal.SizeOf(typeof(RawKeyboard)))return false;var header=(RawHeader)Marshal.PtrToStructure(data,typeof(RawHeader));if(header.type!=1||header.size>size)return false;keyboard=(RawKeyboard)Marshal.PtrToStructure(IntPtr.Add(data,headerSize),typeof(RawKeyboard));return keyboard.key<255&&keyboard.scan!=0xFF;}
 static void Enqueue(ObservedPress press){try{output.TryAdd(press);}catch(InvalidOperationException){}}
 static void Press(string action,int key,int modifiers,string method){Enqueue(new ObservedPress{action=action,key=key,modifiers=modifiers,method=method,at=(long)(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds});}
 static void PollKeys(){var poller=new ConfiguredKeyPoller();Func<int,bool> down=Down;Action<ObservedPress> emit=Enqueue;while(!stopping){var current=bindings;poller.Tick(current,down,(long)(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds,emit);Thread.Sleep(current.Length==0?50:8);}}
 static void WritePresses(){try{var pairs=new PressPairMatcher();foreach(var p in output.GetConsumingEnumerable())if(pairs.Accept(p)){Interlocked.Increment(ref matches);Console.WriteLine("{\"type\":\"press\",\"action\":\""+p.action+"\",\"key\":"+p.key+",\"modifiers\":"+p.modifiers+",\"method\":\""+p.method+"\",\"at\":"+p.at+"}");}}catch{PostThreadMessage(threadId,0x12,IntPtr.Zero,IntPtr.Zero);}}
 static void Diagnostic(){if(diagnostic)Console.WriteLine("{\"type\":\"health\",\"bindings\":"+bindings.Length+",\"rawMessages\":"+rawMessages+",\"readErrors\":"+readErrors+",\"altMake\":"+altMake+",\"altBreak\":"+altBreak+",\"f10Make\":"+f10Make+",\"f10Break\":"+f10Break+",\"hookF10Make\":"+hookF10Make+",\"hookF10Break\":"+hookF10Break+",\"matches\":"+matches+"}");}
 static void RefreshHook(){IntPtr next=SetWindowsHookEx(13,callback,GetModuleHandle(null),0);if(next==IntPtr.Zero)throw new System.ComponentModel.Win32Exception();IntPtr previous=hook;hook=next;if(previous!=IntPtr.Zero)UnhookWindowsHookEx(previous);lastHookAt=Environment.TickCount;foreground=GetForegroundWindow();hookMatcher.SeedModifiers(Down);}
 static IntPtr OnKey(int code,IntPtr message,IntPtr data){
  // Never block the system hook on stdout, IPC, recording or disk operations.
  // A dedicated writer thread processes only matched configured actions.
  try{if(code>=0){int kind=message.ToInt32();if(kind==0x100||kind==0x104||kind==0x101||kind==0x105){var key=(HookKey)Marshal.PtrToStructure(data,typeof(HookKey));bool down=kind==0x100||kind==0x104;if(key.key==121){if(down)hookF10Make++;else hookF10Break++;}int normalized=RawKeyMatcher.Normalize((int)key.key,(int)key.scan,(key.flags&1)!=0?2:0);string action=hookMatcher.Match(bindings,normalized,down,(key.flags&0x20)!=0);if(action!=null)Press(action,(int)key.key,hookMatcher.LastModifiers,"hook");}}}catch{}
  return CallNextHookEx(hook,code,message,data);
 }
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
    rawMessages++;uint size=bufferSize;uint received=GetRawInputData(message.LParam,0x10000003,buffer,ref size,headerSize);
    RawKeyboard key;if(received!=uint.MaxValue&&received<=bufferSize&&ReadKeyboard(buffer,received,out key)){int normalized=RawKeyMatcher.Normalize(key.key,key.scan,key.flags);bool down=(key.flags&1)==0;if(normalized==0xA4||normalized==0xA5){if(down)altMake++;else altBreak++;}if(normalized==121){if(down)f10Make++;else f10Break++;}string action=matcher.Match(bindings,normalized,down);if(action!=null)Press(action,key.key,matcher.Modifiers,"raw");}else readErrors++;
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
  var stale=new RawKeyMatcher();stale.Match(b,0xA4,true);if(stale.Match(b,121,true,false)!=null)throw new Exception("Released Alt context overrides stale modifier state");
  var context=new RawKeyMatcher();if(context.Match(b,121,true,true)!="replay"||context.LastModifiers!=2)throw new Exception("Alt context without modifier history");context.Match(b,121,false);if(context.Match(b,121,true)!=null)throw new Exception("Bare F10 must not save");context.Match(b,121,false);context.Match(b,0xA2,true);if(context.Match(b,121,true,true)!=null)throw new Exception("AltGr context must keep Control");
  var raw=new RawKeyMatcher();raw.Match(b,0xA4,true);if(raw.Match(b,121,true)!="replay"||raw.Match(b,121,true)!=null)throw new Exception("Raw Alt+F10/repeat");raw.Match(b,121,false);raw.Match(b,0xA5,true);raw.Match(b,0xA4,false);if(raw.Match(b,121,true)!="replay")throw new Exception("Right Alt remains held");raw.Match(b,121,false);raw.Match(b,0xA0,true);if(raw.Match(b,121,true)!="toggle")throw new Exception("Raw exact modifiers");raw.Match(b,121,false);raw.Match(b,0xA2,true);if(raw.Match(b,121,true)!=null)throw new Exception("Raw extra modifiers");raw.ReleaseInactive(key=>false);raw.Match(b,0xA4,true);if(raw.Match(b,121,true)!="replay")throw new Exception("Missing key-up recovery");
  if(RawKeyMatcher.Normalize(0x12,0x38,2)!=0xA5||RawKeyMatcher.Normalize(0x11,0x1D,0)!=0xA2||RawKeyMatcher.Normalize(0x10,0x36,0)!=0xA1)throw new Exception("Modifier normalization");if(Marshal.SizeOf(typeof(RawHeader))!=24||Marshal.SizeOf(typeof(RawKeyboard))!=16||Marshal.SizeOf(typeof(RawDevice))!=16)throw new Exception("Raw input x64 layout");
  IntPtr packet=Marshal.AllocHGlobal(48);try{Marshal.StructureToPtr(new RawHeader{type=1,size=48},packet,false);Marshal.StructureToPtr(new RawKeyboard{key=121,scan=0x44},IntPtr.Add(packet,24),false);RawKeyboard decoded;if(!ReadKeyboard(packet,48,out decoded)||decoded.key!=121||ReadKeyboard(packet,39,out decoded))throw new Exception("Raw keyboard packet");Marshal.StructureToPtr(new RawHeader{type=0,size=48},packet,false);if(ReadKeyboard(packet,48,out decoded))throw new Exception("Non-keyboard packet");}finally{Marshal.FreeHGlobal(packet);}
  var pairs=new PressPairMatcher();if(!pairs.Accept(new ObservedPress{action="replay",key=121,modifiers=2,method="hook",at=1000})||pairs.Accept(new ObservedPress{action="replay",key=121,modifiers=2,method="raw",at=1003})||pairs.Accept(new ObservedPress{action="replay",key=121,modifiers=2,method="poll",at=1007})||!pairs.Accept(new ObservedPress{action="replay",key=121,modifiers=2,method="raw",at=1050})||pairs.Accept(new ObservedPress{action="replay",key=121,modifiers=2,method="hook",at=1053})||pairs.Accept(new ObservedPress{action="replay",key=121,modifiers=2,method="poll",at=1057}))throw new Exception("Observer duplicate pairing");
  var poller=new ConfiguredKeyPoller();var held=new HashSet<int>();var found=new List<ObservedPress>();poller.Tick(b,held.Contains,0,found.Add);held.Add(0xA4);held.Add(121);poller.Tick(b,held.Contains,1000,found.Add);poller.Tick(b,held.Contains,1020,found.Add);held.Remove(121);poller.Tick(b,held.Contains,1040,found.Add);held.Add(121);poller.Tick(b,held.Contains,1060,found.Add);if(found.Count!=2||found[0].action!="replay"||found[0].method!="poll"||found[1].at!=1060)throw new Exception("Background polling fallback");poller.Tick(new Binding[0],held.Contains,1070,found.Add);poller.Tick(b,held.Contains,1080,found.Add);poller.Tick(b,held.Contains,1100,found.Add);if(found.Count!=2)throw new Exception("Polling resumed while key held");held.Remove(121);poller.Tick(b,held.Contains,1120,found.Add);held.Add(121);poller.Tick(b,held.Contains,1140,found.Add);if(found.Count!=3)throw new Exception("Polling rearm");
  var original=Console.Out;var captured=new System.IO.StringWriter();try{Console.SetOut(captured);var writer=new Thread(WritePresses);writer.IsBackground=true;writer.Start();foreach(string method in new[]{"hook","raw","poll"})Enqueue(new ObservedPress{action="replay",key=121,modifiers=2,method=method,at=2000});foreach(string method in new[]{"hook","raw","poll"})Enqueue(new ObservedPress{action="replay",key=121,modifiers=2,method=method,at=2100});output.CompleteAdding();if(!writer.Join(1000))throw new Exception("Asynchronous writer did not drain");}finally{Console.SetOut(original);}if(captured.ToString().Split(new[]{'\n'},StringSplitOptions.RemoveEmptyEntries).Length!=2)throw new Exception("Asynchronous writer duplicated a press");
  Console.WriteLine("HOTKEY_MATCHER_OK RAW_INPUT_MATCHER_OK HOOK_MATCHER_OK POLL_MATCHER_OK ASYNC_WRITER_OK");
 }
 [STAThread]static int Main(string[] args){try{
  if(args.Length>0&&args[0]=="--self-test"){SelfTest();return 0;}diagnostic=args.Length>0&&args[0]=="--diagnostic";threadId=GetCurrentThreadId();
  var writer=new Thread(WritePresses);writer.IsBackground=true;writer.Start();var poll=new Thread(PollKeys);poll.IsBackground=true;poll.Start();
  using(var window=new InputWindow())using(var timer=new System.Windows.Forms.Timer()){matcher.SeedModifiers(Down);try{RefreshHook();}catch{}timer.Interval=250;timer.Tick+=(sender,e)=>{matcher.ReleaseInactive(Down);hookMatcher.ReleaseInactive(Down);if(GetForegroundWindow()!=foreground||unchecked(Environment.TickCount-lastHookAt)>=5000){try{RefreshHook();}catch{}}if(++ticks%8==0)Diagnostic();};timer.Start();var input=new Thread(ReadConfig);input.IsBackground=true;input.Start();Console.WriteLine("{\"type\":\"ready\",\"backend\":\""+(hook==IntPtr.Zero?"raw-input+poll":"raw-input+hook+poll")+"\"}");Application.Run();}return 0;
 }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}finally{stopping=true;if(hook!=IntPtr.Zero)UnhookWindowsHookEx(hook);output.CompleteAdding();}}
}
