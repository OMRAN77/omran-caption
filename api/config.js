// Settings the Android app reads each time captions start, so they can be
// tuned here (merge -> Vercel deploys) without installing a new APK.
// The app keeps the last values it got, clamps each one to a safe range, and
// uses its built-in defaults (the same numbers as below) if this fails.
const SETTINGS = {
  version: 1,
  // Each audio slice ends at a quiet moment between these lengths (ms).
  sliceMinMs: 1100,
  sliceMaxMs: 1500,
  // A slice whose loudest 50 ms is under this RMS (0-1) is silence: not sent.
  silenceRms: 0.002,
  // A 50 ms frame this many times quieter than the slice's median is a gap.
  quietRatio: 0.5,
  // Slices in a row with no words before the caption is cleared.
  emptyBeforeClear: 3,
  // Previous lines sent with each slice as translation context.
  contextLines: 2,
  // Speech detector on the phone (Silero VAD, app 1.5.0+): a slice is sent
  // only with at least minSpeechMs of speech (probability >= vadThreshold),
  // so silence, room noise and music alone are not sent. vadEnabled: false
  // sends every audible slice, as before.
  vadEnabled: true,
  vadThreshold: 0.35,
  minSpeechMs: 128,
};

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(SETTINGS);
};
