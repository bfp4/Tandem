import { Platform } from 'react-native';

/**
 * Read a local image URI into a Blob for Firebase Storage uploads.
 * On native, `fetch(uri).blob()` often fails for gallery `content://` / `file://` URIs; XMLHttpRequest handles them.
 */
export function uriToBlob(uri: string): Promise<Blob> {
  if (Platform.OS === 'web') {
    return fetch(uri).then(r => {
      if (!r.ok) throw new Error('Could not read image');
      return r.blob();
    });
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error('Could not read image file'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send();
  });
}
