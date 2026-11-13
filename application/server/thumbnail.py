import sys,io,warnings
from PIL import Image,ImageOps
Image.MAX_IMAGE_PIXELS=10_000_000
warnings.simplefilter('error',Image.DecompressionBombWarning)
raw=sys.stdin.buffer.read(2_097_153)
if len(raw)>2_097_152:raise SystemExit(2)
with Image.open(io.BytesIO(raw)) as source:
 if source.format not in {'JPEG','PNG','WEBP','GIF','AVIF'}:raise SystemExit(2)
 source.seek(0);source.draft('RGB',(960,640))
 image=ImageOps.exif_transpose(source).convert('RGB')
 image.thumbnail((480,320),Image.Resampling.LANCZOS)
 result=None
 for quality in [62,52,42,32]:
  out=io.BytesIO();image.save(out,format='WEBP',quality=quality,method=4,exif=b'');result=out.getvalue()
  if len(result)<=24576:break
 if len(result)>24576:
  image.thumbnail((320,213),Image.Resampling.LANCZOS);out=io.BytesIO();image.save(out,format='WEBP',quality=35,method=4);result=out.getvalue()
 if len(result)>24576:raise SystemExit(2)
 sys.stdout.buffer.write(result)
