# Trust Fall

1. Support the ramp at its fixed angle and leave the unloaded rocker on the servo, disconnected from the ramp link. Keep the existing Uno R4 Minima wiring. The servo signal is D9. The L298N uses ENA D5, IN1 D7 and IN2 D8.
2. Upload the camera sketch in `arduino/TrustFall/TrustFall.ino` to the UNO R4 Minima, then close Serial Monitor.
3. Open the deployed site directly in desktop Chrome or Edge, or run `python -m http.server 8080 --bind 127.0.0.1 --directory public` from the repository root and open **http://localhost:8080**.
4. Click **Start camera** and stand upright, side-on, with nose, shoulder and hip visible. **U** resets the upright reference. The teal joints show person detection, and the caption and ramp glow track changes in lean.
5. Click **Connect Uno** and select the board. The page checks the 1300 and 1450 microsecond endpoints and selects SPEED 0 if the board reports a different speed.
6. The interface arms the servo and streams lean updates about eight times a second. Upright commands 1300 µs and maximum lean commands 1450 µs. The belt runs at the build's calibrated SPEED 0 setting.
7. A dedicated USB worker sends zero lean when the pose is lost. Disconnecting pauses servo updates. The belt keeps its selected speed and the servo holds its last position on a serial timeout.
8. The animation follows the servo pulse and motor enable state reported by **STATUS**. To line up the animated balls, press **B** when a physical ball leaves the low end, then again when the same ball returns. There is no physical motor encoder.

## If the belt stops when the servo moves

With power off, unplug the servo and repeat the camera test. If the belt now turns, check the shared supply and make sure the rocker is unloaded. To power the MG995 separately, connect its red lead to four AA alkaline cells in series (+), brown/black to pack negative, and pack negative to Uno GND. Keep its signal on D9. Disconnect servo red from Uno 5V before making this connection. The AA positive goes only to the servo.

For a belt completely independent of the Uno and L298N, use a separate supply rated for the gearmotor. If it is rated for 6 V, power down, disconnect both motor wires from OUT1/OUT2, and connect the motor directly to the isolated four-AA pack through its power switch. Swap the two leads with power off if the belt runs backward. This gives full pack voltage and may change the belt speed; retap B to match its lap time.

## Deploy

Import this repository into Vercel, choose **Other** and deploy from the root. `vercel.json` sets `public` as the output directory. No install command, build command, environment variables or backend are needed. Open the deployed URL directly for camera and USB permissions.

## Included browser assets

p5.js 1.11.3 (LGPL, license alongside the bundle), MediaPipe Tasks Vision 0.10.22-rc.20250304 (Apache 2.0) and Google's Pose Landmarker Full model. Video processing runs on the demo computer.

