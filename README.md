
# Video Chat with Emotion Recognition

This project is a web-based video chat application that supports real-time emotion recognition using WebRTC and `face-api.js`. It allows users to create or join a room for 1-to-1 video calls, with emotion detection displayed for both the local and remote users.

## Features

- **1-to-1 Video Calls**: Create or join a room using a unique Room ID.
- **Real-Time Emotion Detection**: Uses face-api.js for detecting emotions such as happiness, sadness, anger, etc.
- **Toggle Controls**: Enable or disable video, audio, and emotion detection.
- **Simple User Interface**: Clean and responsive UI for ease of use.
- **No Authentication Required**: Just enter the Room ID and start the video call.

## Technologies Used

- **WebRTC**: For peer-to-peer video communication.
- **Socket.io**: For signaling between users to establish WebRTC connections.
- **face-api.js**: For face detection and emotion recognition.
- **HTML/CSS/JavaScript**: Frontend technologies for UI development.

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Piyush12800/video-call-app.git
   cd video-call-app
   ```

2. **Install dependencies:**
   ```bash
   cd server
   npm install
   ```

3. **Run the Applicatio:**
   ```bash
   node .\server.\server.js
   ```
4. **Future Improvements**
   Add support for group video calls.
  Integrate authentication for better security.
  Improve emotion detection accuracy.
  Add chat functionality.
