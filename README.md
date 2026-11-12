# Trust Fall

1. Support the physical ramp at a fixed angle. Leave the printed rocker on the servo and disconnect its link from the ramp so the rocker can move freely. Keep the existing D9 servo and L298N wiring (ENA D5, IN1 D7, IN2 D8).
2. Upload `arduino/TrustFallDemo/TrustFallDemo.ino` to **Arduino UNO R4 Minima** using the board's USB port. Close Serial Monitor, the Python camera and the assembly helper. Keep the Uno connected by USB and use your demo's actuator power.
3. From the repository root run `python -m http.server 8080 --bind 127.0.0.1 --directory public`. Open **http://localhost:8080** in desktop Chrome or Edge. The model and libraries are included. The hosted HTTPS site works the same way.
4. Click **Start camera**. Stand upright, side-on in either direction, with nose, shoulder and hip visible. Hold still briefly to set zero. Lean backward. The dotted line shows vertical, the solid line tracks your torso and the number shows backward lean from upright. **U** resets the upright reference.
5. Click **Connect Uno** and select the Uno's USB port. The DC motor runs continuously. Upright commands **1350 µs**, 15° backward lean commands **1500 µs**, and 30° or more commands **1650 µs**. No EEPROM limits or servo assembly calibration are used. These pulse widths define the command range, not measured rocker angles. Motor speed is fixed at 160/255. On loss of pose the belt continues, and the servo returns to its upright command.
6. The animated ramp follows the pulse width reported by the Uno. The three animated balls run while the board reports the belt enabled. To match the animation to the physical belt, press **B** as one ball leaves the low end, then **B** when that same ball leaves it on the next lap. The animation estimates travel between taps. There is no ball or motor encoder.
7. **Stop mechanism** or **Esc** stops the belt and holds the rocker. Switching tabs or losing the USB heartbeat also stops the belt. The camera can run alone to rehearse the animation.

## Deploy

Import this repository into Vercel, choose **Other** and deploy from the root. `vercel.json` sets `public` as the output directory. No install command, build command, environment variables or backend are needed. Open the deployed URL directly for camera and USB permissions.

## Included browser assets

p5.js 1.11.3 (LGPL, license alongside the bundle), MediaPipe Tasks Vision 0.10.22-rc.20250304 (Apache 2.0) and Google's Pose Landmarker Full model. Video processing runs on the demo computer.

