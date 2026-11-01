$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=Split-Path -Parent $PSScriptRoot
$artDir=Join-Path $root 'installer'
$ink=[System.Drawing.ColorTranslator]::FromHtml('#111111')
$cream=[System.Drawing.ColorTranslator]::FromHtml('#E6D7BD')
$muted=[System.Drawing.ColorTranslator]::FromHtml('#A3A29A')
$bgBrush=[System.Drawing.SolidBrush]::new($ink)
$creamBrush=[System.Drawing.SolidBrush]::new($cream)
$mutedBrush=[System.Drawing.SolidBrush]::new($muted)
$line=[System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#363630'),2)
function Draw-Rewind($graphics,[float]$x,[float]$y,[float]$size,$brush){
  $graphics.FillPolygon($brush,[System.Drawing.PointF[]]@([System.Drawing.PointF]::new($x,$y+$size/2),[System.Drawing.PointF]::new($x+$size/2,$y),[System.Drawing.PointF]::new($x+$size/2,$y+$size)))
  $graphics.FillPolygon($brush,[System.Drawing.PointF[]]@([System.Drawing.PointF]::new($x+$size/2,$y+$size/2),[System.Drawing.PointF]::new($x+$size,$y),[System.Drawing.PointF]::new($x+$size,$y+$size)))
}
$poster=[System.Drawing.Bitmap]::new(492,942)
$g=[System.Drawing.Graphics]::FromImage($poster)
$g.SmoothingMode='AntiAlias'
$g.TextRenderingHint='AntiAliasGridFit'
$g.Clear($ink)
$brand=[System.Drawing.Font]::new('Segoe UI',30,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$caption=[System.Drawing.Font]::new('Consolas',18,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel)
$headline=[System.Drawing.Font]::new('Segoe UI',44,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('rewind.',$brand,$creamBrush,44,42)
Draw-Rewind $g 78 235 332 $creamBrush
$g.DrawLine($line,44,636,448,636)
for($tick=0;$tick -le 12;$tick++){$pos=44+$tick*33.66;$g.DrawLine($line,$pos,629,$pos,643)}
$g.FillEllipse($creamBrush,320,630,12,12)
$g.DrawString('RECORD / REPLAY / REWATCH',$caption,$mutedBrush,44,670)
$g.FillRectangle($creamBrush,0,756,492,186)
$g.DrawString("YOUR MOMENTS.`nYOUR RULES.",$headline,$bgBrush,40,782)
$poster.Save((Join-Path $artDir 'wizard.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$poster.Dispose()
$small=[System.Drawing.Bitmap]::new(168,168)
$g=[System.Drawing.Graphics]::FromImage($small);$g.SmoothingMode='AntiAlias';$g.Clear($ink)
Draw-Rewind $g 24 32 120 $creamBrush
$small.Save((Join-Path $artDir 'wizard-small.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$small.Dispose()
# A PNG-backed icon keeps the same vector silhouette sharp in Explorer and shortcuts.
$icon=[System.Drawing.Bitmap]::new(256,256)
$g=[System.Drawing.Graphics]::FromImage($icon);$g.SmoothingMode='AntiAlias';$g.Clear($ink)
Draw-Rewind $g 39 50 178 $creamBrush
$memory=[System.IO.MemoryStream]::new();$icon.Save($memory,[System.Drawing.Imaging.ImageFormat]::Png);$png=$memory.ToArray()
$file=[System.IO.File]::Create((Join-Path $root 'assets/icon.ico'));$writer=[System.IO.BinaryWriter]::new($file)
$writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]1)
$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([byte]0)
$writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([uint32]$png.Length);$writer.Write([uint32]22);$writer.Write($png)
$writer.Dispose();$memory.Dispose();$g.Dispose();$icon.Dispose()
$brand.Dispose();$caption.Dispose();$headline.Dispose();$bgBrush.Dispose();$creamBrush.Dispose();$mutedBrush.Dispose();$line.Dispose()
