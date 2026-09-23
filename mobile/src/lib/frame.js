/**
 * Grabs a frame from the camera and shrinks it before upload.
 *
 * Shrinking is where most of the latency win is. A full-size phone photo is
 * 2-4 MB; at 640px wide and 50% quality it is around 40-70 KB, which is the
 * difference between a two second round trip and a sub-second one.
 */
let IM = null;
try {
  IM = require('expo-image-manipulator');
} catch {}

async function shrink(uri) {
  if (!IM) return null;
  try {
    // New API (Expo SDK 52+)
    if (IM.ImageManipulator?.manipulate) {
      const ctx = IM.ImageManipulator.manipulate(uri).resize({ width: 640 });
      const image = await ctx.renderAsync();
      const out = await image.saveAsync({
        compress: 0.5,
        format: IM.SaveFormat?.JPEG ?? 'jpeg',
        base64: true,
      });
      return out.base64 || null;
    }
    // Legacy API
    if (IM.manipulateAsync) {
      const out = await IM.manipulateAsync(
        uri,
        [{ resize: { width: 640 } }],
        { compress: 0.5, format: IM.SaveFormat.JPEG, base64: true }
      );
      return out.base64 || null;
    }
  } catch {}
  return null;
}

/** Returns a base64 JPEG string, or null if the camera was not ready. */
export async function captureFrame(cameraRef) {
  const cam = cameraRef?.current;
  if (!cam?.takePictureAsync) return null;
  try {
    const photo = await cam.takePictureAsync({
      quality: 0.4,
      base64: true,
      skipProcessing: true,
      shutterSound: false,
      exif: false,
    });
    const small = await shrink(photo.uri);
    return small || photo.base64 || null;
  } catch {
    return null;
  }
}
