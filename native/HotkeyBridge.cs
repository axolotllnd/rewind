using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

class Binding { public string action {get;set;} public int key {get;set;} public int modifiers {get;set;} }
class PressMatcher {
 readonly HashSet<int> held=new HashSet<int>();
 public string Match(Binding[] bindings,int key,int modifiers,bool down){
  if(!down){held.Remove(key);return null;}
  if(!held.Add(key))return null;
  foreach(var binding in bindings)if(binding.key==key&&binding.modifiers==modifiers)return binding.action;
  return null;
 }
}
class HotkeyBridge {
 delegate IntPtr HookProc(int code,IntPtr message,IntPtr data);
 [StructLayout(LayoutKind.Sequential)]struct KeyData {public uint key,scan,flags,time;public UIntPtr extra;}
 [DllImport("user32.dll",SetLastError=true)]static extern IntPtr SetWindowsHookEx(int type,HookProc callback,IntPtr module,uint thread);
 [DllImport("user32.dll")]static extern bool UnhookWindowsHookEx(IntPtr hook);
 [DllImport("user32.dll")]static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
 [DllImport("user32.dll")]static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")]static extern bool PostThreadMessage(uint thread,uint message,IntPtr wp,IntPtr lp);
 [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr GetModuleHandle(string name);
 static volatile Binding[] bindings=new Binding[0];static readonly PressMatcher matcher=new PressMatcher();
 static HookProc callback=OnKey;static IntPtr hook;static uint threadId;
 static bool Down(int key){return (GetAsyncKeyState(key)&0x8000)!=0;}
 static IntPtr OnKey(int code,IntPtr message,IntPtr ptr){
  if(code>=0){var key=(KeyData)Marshal.PtrToStructure(ptr,typeof(KeyData));int kind=message.ToInt32();
   if(kind==0x100||kind==0x104||kind==0x101||kind==0x105){
    int modifiers=(Down(0x11)?1:0)|(((key.flags&0x20)!=0||Down(0x12))?2:0)|(Down(0x10)?4:0)|((Down(0x5B)||Down(0x5C))?8:0);
    string action=matcher.Match(bindings,(int)key.key,modifiers,kind==0x100||kind==0x104);
    if(action!=null)Console.WriteLine("{\"type\":\"press\",\"action\":\""+action+"\",\"key\":"+key.key+",\"modifiers\":"+modifiers+",\"at\":"+(long)(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds+"}");
   }
  }
  // Observe configured shortcuts only. Never consume keys or disable the other application.
  return CallNextHookEx(hook,code,message,ptr);
 }
 static void ReadConfig(){try{string line;var json=new JavaScriptSerializer();while((line=Console.ReadLine())!=null){try{var next=json.Deserialize<Binding[]>(line);if(next==null||next.Length>3)continue;var keys=new HashSet<string>();bool valid=true;foreach(var b in next){if(!new List<string>{"replay","record","toggle"}.Contains(b.action)||b.key<1||b.key>254||b.modifiers<1||b.modifiers>15||!keys.Add(b.key+":"+b.modifiers))valid=false;}if(valid)bindings=next;}catch{}}}finally{PostThreadMessage(threadId,0x12,IntPtr.Zero,IntPtr.Zero);}}
 static void SelfTest(){var m=new PressMatcher();var b=new[]{new Binding{action="replay",key=121,modifiers=2},new Binding{action="toggle",key=121,modifiers=6}};
  if(m.Match(b,121,2,true)!="replay"||m.Match(b,121,2,true)!=null)throw new Exception("Repeat handling");m.Match(b,121,2,false);
  if(m.Match(b,121,6,true)!="toggle")throw new Exception("Exact modifiers");m.Match(b,121,6,false);
  if(m.Match(b,121,3,true)!=null)throw new Exception("Extra modifiers");Console.WriteLine("HOTKEY_MATCHER_OK");
 }
 [STAThread]static int Main(string[] args){try{if(args.Length>0&&args[0]=="--self-test"){SelfTest();return 0;}threadId=GetCurrentThreadId();hook=SetWindowsHookEx(13,callback,GetModuleHandle(null),0);if(hook==IntPtr.Zero)throw new System.ComponentModel.Win32Exception();
  // Create the message queue before the configuration reader can signal EOF.
  using(var queue=new Control()){var handle=queue.Handle;var input=new Thread(ReadConfig);input.IsBackground=true;input.Start();Console.WriteLine("{\"type\":\"ready\"}");Application.Run();}return 0;
 }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}finally{if(hook!=IntPtr.Zero)UnhookWindowsHookEx(hook);}}
}
