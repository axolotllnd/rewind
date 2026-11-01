// Test-only: reserve an unused chord in a separate process and exercise it in a focused test window.
using System;using System.Runtime.InteropServices;using System.Threading;
class ShortcutProbe{
 [DllImport("user32.dll",SetLastError=true)]static extern bool RegisterHotKey(IntPtr window,int id,uint mods,uint key);
 [DllImport("user32.dll")]static extern bool UnregisterHotKey(IntPtr window,int id);
 [DllImport("user32.dll")]static extern int GetMessage(out Message msg,IntPtr hwnd,uint min,uint max);
 [DllImport("user32.dll")]static extern bool PostThreadMessage(uint thread,uint msg,IntPtr wp,IntPtr lp);
 [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
 [StructLayout(LayoutKind.Sequential)]struct Message{public IntPtr window;public uint message;public UIntPtr wp;public IntPtr lp;public uint time;public int x,y;public uint priv;}
 static int Main(string[] args){try{if(args[0]=="reserve"){if(!RegisterHotKey(IntPtr.Zero,1,0x4007,119))throw new Exception("Test chord is already in use");uint thread=GetCurrentThreadId();var reader=new Thread(()=>{Console.ReadLine();PostThreadMessage(thread,0x12,IntPtr.Zero,IntPtr.Zero);});reader.IsBackground=true;reader.Start();Console.WriteLine("RESERVED");try{Message msg;while(GetMessage(out msg,IntPtr.Zero,0,0)>0)if(msg.message==0x312)Console.WriteLine("OTHER_APP_PRESS");}finally{UnregisterHotKey(IntPtr.Zero,1);}return 0;}
  return 1;
 }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}}
}
