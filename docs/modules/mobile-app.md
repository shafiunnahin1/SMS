# Mobile App Plan (React Native)

## Which App for Whom?
| App | Target User | Platform |
|-------|-------------|----------|
| Institution Parent App | অভিভাবক | Android + iOS |
| Institution Teacher App | শিক্ষক | Android + iOS |
| Institution Student App | ছাত্র | Android (primary) |

## Tech Stack
- Framework: React Native (Expo managed workflow)
- Navigation: React Navigation v6
- State: Zustand (same as web)
- API: Axios (same interceptor logic)
- Push: Firebase Messaging (@react-native-firebase/messaging)
- Storage: AsyncStorage (token সংরক্ষণ)
- PDF View: react-native-pdf

## Folder Structure
```
institution-mobile-app/
├── src/
│   ├── api/          ← same as web (axios.js, studentApi.js...)
│   ├── store/        ← same Zustand stores
│   ├── navigation/
│   │   ├── AppNavigator.jsx
│   │   ├── ParentStack.jsx
│   │   ├── TeacherStack.jsx
│   │   └── StudentStack.jsx
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.jsx
│   │   │   └── ForgotPasswordScreen.jsx
│   │   ├── parent/
│   │   │   ├── DashboardScreen.jsx
│   │   │   ├── ChildAttendanceScreen.jsx
│   │   │   ├── ResultScreen.jsx
│   │   │   ├── FeePaymentScreen.jsx
│   │   │   ├── NoticesScreen.jsx
│   │   │   └── MessagesScreen.jsx
│   │   ├── teacher/
│   │   │   ├── DashboardScreen.jsx
│   │   │   ├── AttendanceScreen.jsx
│   │   │   ├── MarkEntryScreen.jsx
│   │   │   └── HomeworkScreen.jsx
│   │   └── student/
│   │       ├── DashboardScreen.jsx
│   │       ├── ResultScreen.jsx
│   │       ├── RoutineScreen.jsx
│   │       └── MaterialsScreen.jsx
│   ├── components/   ← mobile-specific UI components
│   └── hooks/        ← same custom hooks
├── app.json
└── .env
```

## Firebase Push Notification Setup
```javascript
// React Native (App.jsx)
import messaging from '@react-native-firebase/messaging'

useEffect(() => {
  // Get FCM token and save it on the server
  messaging().getToken().then(token => {
    api.post('/user/fcm-token', { fcm_token: token })
  })

  // Foreground notification
  messaging().onMessage(async remoteMessage => {
    showLocalNotification(remoteMessage.notification)
  })

  // Background/Quit notification tap
  messaging().onNotificationOpenedApp(remoteMessage => {
    navigateToScreen(remoteMessage.data)
  })
}, [])
```

## Phase 4 Development Plan
```
Week 1-2: Expo setup, Navigation, Auth, API connection
Week 3-4: Parent App screens (Dashboard, Attendance, Result, Fee)
Week 5-6: Teacher App screens (Attendance, Mark Entry)
Week 7-8: Firebase Push, offline support, Play Store deploy
Week 9+:  Student App, iOS build, App Store
```

## DB — FCM Token Storage
```sql
ALTER TABLE users ADD COLUMN fcm_token VARCHAR(255) NULL;
-- PATCH /api/user/fcm-token → { fcm_token }
-- লগিনের পর mobile app এই endpoint call করে token save করে
```
