using System;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Web.Script.Serialization;
class ScreenProbe{
 [StructLayout(LayoutKind.Sequential)]struct Rect{public int left,top,right,bottom;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct OutputDesc{[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string name;public Rect rect;[MarshalAs(UnmanagedType.Bool)]public bool attached;public int rotation;public IntPtr monitor;}
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Enumerate(IntPtr self,uint index,out IntPtr item);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Description(IntPtr self,out OutputDesc desc);
 [DllImport("dxgi.dll")]static extern int CreateDXGIFactory1(ref Guid iid,out IntPtr factory);
 static T Method<T>(IntPtr obj,int index){var table=Marshal.ReadIntPtr(obj);return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(table,index*IntPtr.Size),typeof(T));}
 [MTAThread]static int Main(){try{var iid=new Guid("770aae78-f26f-4dba-a829-253c83d1b387");IntPtr factory;Marshal.ThrowExceptionForHR(CreateDXGIFactory1(ref iid,out factory));var list=new List<object>();try{for(uint a=0;;a++){IntPtr adapter;int hr=Method<Enumerate>(factory,7)(factory,a,out adapter);if(hr<0)break;try{for(uint n=0;;n++){IntPtr output;hr=Method<Enumerate>(adapter,7)(adapter,n,out output);if(hr<0)break;try{OutputDesc d;Marshal.ThrowExceptionForHR(Method<Description>(output,7)(output,out d));if(d.attached)list.Add(new{adapter=a,index=n,name=d.name,x=d.rect.left,y=d.rect.top,width=d.rect.right-d.rect.left,height=d.rect.bottom-d.rect.top});}finally{Marshal.Release(output);}}}finally{Marshal.Release(adapter);}}}finally{Marshal.Release(factory);}Console.Write(new JavaScriptSerializer().Serialize(list));return 0;}catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}}
}
