---
name: learn-mobile
description: Extra questions, tool choices and build guidance for a LearnBuild project that is an app for phones or tablets. The learn-new, learn-plan and learn-build skills send you here; follow the part they name.
user-invocable: false
---

# Apps for phones

A phone app needs more than a web page does: a large application on the learner's computer, sometimes a particular kind of computer, a phone or a simulated one to run on, and paid accounts to publish. Find these out before the brief is written, so the learner chooses with the costs in view and the plan fits what they have.

Costs and sizes below change. Give them as rough figures and point the learner to the official page for the current ones.

## Part 1: questions for the brief

The learn-new skill sends you here when the learner wants an app on a phone or a tablet. Ask these one at a time, skipping any they have already answered. Explain each technical word in a sentence.

1. **Which phones should it run on?** iPhone, Android or both. If they are unsure, ask which phone they use and which phones the people it is for use.
2. **What computer are you building it on?** Run `uname -sm` to see for yourself, and ask only if the command cannot run. Ask roughly how much free disk space they have, because the applications below take tens of gigabytes.
3. **Which phone do you have to try it on?** An iPhone, an Android phone, both or none. With none, the app runs in a simulator, which is a pretend phone in a window on the computer.
4. **Who needs to be able to install it?** Only them on their own phone, a few people they know, or anyone through the App Store or Google Play. Publishing can be left for later, and the first version does not need it.
5. **Does it use anything only a phone has?** Give examples that fit the idea, such as the camera, the person's location, notifications or working with no internet connection.

Then tell the learner what their answers mean, before writing the brief. Use a short table with what is needed, what it costs and how long it takes. Cover every row below that applies:

| Situation | What to tell them |
|---|---|
| iPhone app | Building one the standard way needs a Mac with Xcode, Apple's free application for making apps. Xcode is a download of many gigabytes from the App Store and can take an hour or more. |
| iPhone app, no Mac | Xcode does not run on Windows or Linux. They can still build an iPhone app with Expo (see Part 2) and run it on their own iPhone through the free Expo Go app. They could also build for Android first, or make a web page that opens on a phone. |
| Android app | Needs Android Studio, Google's free application, which runs on Mac, Windows and Linux. It is a large download, and its simulated phone runs slowly on a computer with less than 8 GB of memory. |
| Both kinds of phone | One shared codebase with Expo covers both. Building each app separately means writing it twice in two languages, which is too much for a first project. |
| Trying it on their own iPhone | Works with a free Apple account. An app installed that way stops opening after seven days and has to be installed again from the computer. |
| Publishing on the App Store | Needs the Apple Developer Program, about US$99 a year, and Apple reviews each app. |
| Publishing on Google Play | Needs a Google Play developer account, about US$25 paid once. |
| No phone to hand | The simulator is enough for a first version. Camera and some other hardware features cannot be tried there. |

If the idea uses nothing only a phone has and does not need to be in a store, say that a web page laid out for a phone screen would do the same job with nothing extra to install, and that it works on both kinds of phone. Offer it as an option and let them choose.

Where what they want does not fit what they have, say so plainly and give the routes that do fit. Ask which they want and wait. Do not choose for them, and do not name programming languages yet beyond what the table needs.

Record the outcome in `.learn-build/PROJECT.md` under a "Phones and equipment" heading: which phones the app targets, the learner's computer, the phone they will try it on, who needs to install it, the phone features it uses, and anything they chose to leave for later, such as publishing. Add the applications, accounts and costs you told them about under "What this project needs".

## Part 2: choosing the tools

The learn-plan skill sends you here. Read "Phones and equipment" in `PROJECT.md`. If it is missing or does not say which phones the app targets, ask the questions in Part 1 before planning.

A language or framework the learner asked for comes first when it can do the job on their computer. Flutter is a reasonable request under the tool rules; mention it under "what else was possible" otherwise.

| The brief says | Use | Installed on the computer |
|---|---|---|
| iPhone only, on a Mac | Swift with SwiftUI | Xcode |
| Android only | Kotlin with Jetpack Compose | Android Studio |
| Both kinds of phone | React Native with Expo, written in TypeScript | Nothing beyond Node.js. Expo Go goes on the phone. |
| iPhone, with no Mac | React Native with Expo, run in Expo Go on their iPhone | Nothing beyond Node.js. Expo Go goes on the phone. |

Notes on these choices:

- Expo is the way the React Native documentation recommends starting a project. In Expo Go the learner scans a code shown in the terminal and the app opens on their phone, which must be on the same Wi-Fi network as the computer.
- Expo Go contains a fixed set of phone features. If the brief needs one it does not contain, the app needs its own development build, which takes Xcode, Android Studio or Expo's cloud build service. Check this against the features in the brief and tell the learner at planning time.
- With Expo, a simulator on the computer is optional. It needs Xcode for an iPhone simulator or Android Studio for an Android one. Plan for it only if the learner has no phone to try on.
- Keep data on the phone itself in the first version. Do not add a server or accounts unless a requirement needs them.

In "What needs to be installed", list applications as well as command-line tools:

- Xcode: checked with `xcodebuild -version`. Note that it comes from the App Store and that a simulator must be present, checked with `xcrun simctl list devices available`.
- Android Studio: it has no version command on the PATH, so the check is a command showing it is installed, such as listing its application folder, plus a simulated phone created in its Device Manager.
- Expo Go: installed on the phone from the App Store or Google Play. No command can check it, so it is not an acceptance criterion. The learner confirms it when the app first opens.

Shape the plan around what a command can check:

- The first task checks the applications, creates the project from the official starter and gets the unchanged starter app running in the simulator or on the phone. Seeing it run before any of their own code exists separates setup problems from mistakes in the app.
- Acceptance criteria are commands: a build that succeeds, and from the testing step on, a test run. For Swift that is `xcodebuild` with a simulator as the destination, for Kotlin `./gradlew assembleDebug` and `./gradlew test`, and for Expo `npx tsc --noEmit` and the test command.
- What appears on the screen is checked by the learner trying it on the phone or simulator. No command can see the screen, so tell the learner this when you present the plan. Give each task that changes a screen a "Try it" line in the roadmap saying what they should do and see. That look is not an acceptance criterion and must not be recorded as one; the learn-build skill saves it separately under "Trying it yourself".
- For "How you will run and use it", read the current pages of the chosen tool's documentation on running an app on a device and on a simulator. Record what the learner needs for each way of running it, such as Expo Go and a shared Wi-Fi network, or an Apple account and Developer Mode for a real iPhone.
- Keep the app's rules and calculations in plain functions apart from the screens, so that tests can cover them without a phone.
- Leave publishing out of the first plan unless the brief asks for it. Signing, store listings and review are a later plan of their own.

When presenting the plan, show under "What you will install" each application with its size and time in rough terms, and say again which parts cost money and which are free.

## Part 3: building and running

The learn-build skill sends you here for a phone app. Everything in "Checking the tools" still applies. The additions below cover applications that are installed and used through windows and menus.

### Installing the applications

The learner installs these, as with any tool. Say before they start how big the download is and that they can keep asking you questions while it runs.

- **Xcode.** Steps for the learner: open the App Store, search for Xcode, press Get and wait for it to finish. Open Xcode once, agree to the licence, and when it asks which platforms to add, tick iOS and let that download finish. Then check with `xcodebuild -version`. If the reply says the command line tools are selected and Xcode is needed, the learner runs `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` in a second terminal window, which asks for their password.
- **Android Studio.** Steps for the learner: download it from https://developer.android.com/studio, open the installer and accept the standard setup, which downloads the Android tools. Then open Device Manager inside Android Studio and create a simulated phone with the suggested settings.
- **Expo Go.** The learner installs it on their phone from the App Store or Google Play.

Describe where to click in the order the learner will meet it, one screen at a time. Application screens change between versions, so if the learner says theirs looks different, ask what they see and work from that.

### Creating the project

- **Swift.** Xcode has no command that creates an app project, so the learner creates it in Xcode. Give the exact choices: a new project from the iOS App template, the product name, SwiftUI as the interface, Swift as the language, saved inside the project folder. After that you write and change the Swift files, and Xcode picks up files added to the project's folder.
- **Kotlin.** The learner creates the project in Android Studio from the Empty Activity template, which uses Jetpack Compose, saved inside the project folder. Command-line builds with `./gradlew` need Java. Use the copy that comes inside Android Studio in place of a separate install: find it by listing the application's folder and set `JAVA_HOME` to it on the command.
- **Expo.** Run the official `create-expo-app` command yourself. It needs an empty folder, so create the app in a subfolder of the project.

### Running it

- Build from the command line to check the work, and keep the output short: these build tools print hundreds of lines, so show the learner the result and the lines that matter.
- For Swift and Kotlin, the learner runs the app by pressing the Run button in Xcode or Android Studio with a simulator chosen. Tell them where the button is the first time, and what the app should show when it opens.
- For Expo, the learner runs `npx expo start` in a second terminal window inside the app's folder, so that they can see the code to scan and the server stays running while you work.
- Running on a real iPhone from Xcode needs the learner to sign in to Xcode with their Apple account, pick themselves as the team under Signing, switch on Developer Mode on the phone and trust the app in the phone's settings. Give these steps when the brief calls for a real phone, and expect questions.
- After each change to a screen, follow "Trying it yourself" in the learn-build skill. On a phone that step matters more than elsewhere, because no command sees the screen.

When something fails inside one of these applications, ask the learner to copy the error text or describe the screen. You can read build errors yourself by running the build from the command line.
