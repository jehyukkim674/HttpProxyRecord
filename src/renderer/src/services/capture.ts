/**
 * desktopCapturer 소스 id로 화면 1프레임을 캡처해 PNG dataURL을 반환한다.
 * Electron 표준 패턴: getUserMedia(chromeMediaSource) → video 프레임 → canvas.
 * (macOS는 화면 기록 권한 필요 — 실패 시 호출부에서 안내)
 */
export const captureSource = async (sourceId: string): Promise<string> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId },
    } as unknown as MediaTrackConstraints,
  });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve();
    });
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
};
