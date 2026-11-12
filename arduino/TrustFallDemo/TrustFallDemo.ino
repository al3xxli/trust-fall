// Trust Fall camera demo, UNO R4 Minima. Fixed ramp, unloaded rocker on D9.
// Servo pulse widths are explicit. This sketch never reads or writes EEPROM.
#include <Arduino.h>
#include <stdlib.h>
#include <string.h>

constexpr byte ENA = 5, IN1 = 7, IN2 = 8, SERVO_PIN = 9;
constexpr int UPRIGHT_US = 1350, CENTER_US = 1500, FULL_LEAN_US = 1650;
constexpr byte BELT_PWM = 160;
bool rockerEnabled = false;
int pulse = CENTER_US, target = CENTER_US;
unsigned long lastFrameUs = 0;
char line[20];
size_t used = 0;
bool overflow = false;

// D5 runs on hardware PWM. Generate the separate D9 pulse in the main loop
// so starting camera control never allocates or reconfigures a motor timer.
void serviceRocker() {
  const unsigned long now = micros();
  if (!rockerEnabled || now - lastFrameUs < 20000UL) return;
  lastFrameUs = now;
  pulse += constrain(target - pulse, -6, 6);
  digitalWrite(SERVO_PIN, HIGH);
  delayMicroseconds(pulse);
  digitalWrite(SERVO_PIN, LOW);
}

void handleLine() {
  if (!strcmp(line, "PROBE")) {
    Serial.println("TRUSTFALL DEMO 2");
    return;
  }
  if (!strcmp(line, "BELT ON")) {
    Serial.println("BELT ON");  // Compatibility with the existing demo webpage.
    return;
  }
  if (!strcmp(line, "HALT") || !strcmp(line, "HOLD")) {
    target = pulse;  // An older client may send HALT. It only holds the rocker.
    Serial.println("IDLE");
    return;
  }
  if (strncmp(line, "LEAN ", 5) || line[5] < '0' || line[5] > '9') return;
  char *end;
  long lean = strtol(line + 5, &end, 10);
  if (*end || lean < 0 || lean > 100) return;
  rockerEnabled = true;
  target = map(lean, 0, 100, UPRIGHT_US, FULL_LEAN_US);
  Serial.print("RUN ");
  Serial.println(pulse);
}

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  analogWrite(ENA, BELT_PWM);  // Only motor speed write, for the whole power cycle.
  pinMode(SERVO_PIN, OUTPUT);
  digitalWrite(SERVO_PIN, LOW);
  Serial.begin(115200);
}

void loop() {
  for (int i = 0; i < 64 && Serial.available(); ++i) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      line[used] = '\0';
      if (!overflow) handleLine();
      used = 0;
      overflow = false;
    } else if (c >= 32 && c <= 126 && used < sizeof(line) - 1) {
      line[used++] = c;
    } else overflow = true;
  }
  serviceRocker();
}
