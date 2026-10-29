# MOTIVE

MOTIVE is a local-first iPhone fitness and weight-management app prototype.

## Included in this first build

- Daily weight entry and a weight trend view
- Food and snack entries with calorie totals
- Separate manual strength-training records
- Apple Health steps, active energy, and workout sync (iOS development build required)
- Estimated resting energy (BMR) plus logged active calories
- Intake, burn, and net-energy dashboard
- Japanese dark sports-inspired interface with orange accents
- Editable profile and goal settings saved on the device
- Local persistence on the device

The profile and goal screen starts with sample values. Replace them in the app before relying on its estimates; profile settings are stored on the device. The BMR and exercise calorie values are estimates, not medical advice.

## Run locally

1. Install Node.js 22.13 or later.
2. Run `npm install`.
3. Create an iOS development build with `npx eas-cli@latest build --platform ios --profile development`.
4. Install the build on your iPhone, then run `npm start` to use Fast Refresh.

This project targets Expo SDK 58. Apple Health data is read-only and requires an iOS development build plus user authorization. Expo Go does not include the required native HealthKit code. The development build requires an Expo account and Apple signing setup.

## Next implementation steps

1. Add searchable Japanese food entries and photo-assisted calorie estimation with a user confirmation step.
2. Refine HealthKit authorization states and historical sync behavior.
3. Add stronger duplicate detection between manual and HealthKit workouts.

HealthKit reads are initiated from the app and stored on the device; no health records are uploaded to a server. The connection has not yet been verified on a physical iPhone.
