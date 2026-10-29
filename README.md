# MOTIVE

MOTIVE is a local-first iPhone fitness and weight-management app prototype.

## Included in this first build

- Daily weight entry and a weight trend view
- Food and snack entries with calorie totals
- Separate manual strength-training records
- Estimated resting energy (BMR) plus logged active calories
- Intake, burn, and net-energy dashboard
- Japanese dark sports-inspired interface with orange accents
- Editable profile and goal settings saved on the device
- Local persistence on the device

The profile and goal screen starts with sample values. Replace them in the app before relying on its estimates; profile settings are stored on the device. The BMR and exercise calorie values are estimates, not medical advice.

## Run locally

1. Install Node.js 22.13 or later.
2. Run `npm install`.
3. Run `npx expo start`.

This project targets Expo SDK 58. Use a development build for native health data access.

## Next implementation steps

1. Add an iOS HealthKit native module for read-only step, active-energy, and workout imports.
2. Keep imported HealthKit workouts separate from manual strength entries and prevent duplicate calorie counting.
3. Add searchable Japanese food entries and photo-assisted calorie estimation with a user confirmation step.
4. Add Apple Health permission status and a data-source management screen.

The current prototype does not yet connect to Apple Health. It stores data only on the device and does not create an account or send records to a server.
