const socket = io();

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const createRoomButton = document.getElementById('createRoom');
const joinRoomButton = document.getElementById('joinRoom');
const roomIdInput = document.getElementById('roomIdInput');
const roomSelection = document.getElementById('room-selection');
const videoCallSection = document.getElementById('video-call');
const toggleVideoButton = document.getElementById('toggleVideo');
const toggleAudioButton = document.getElementById('toggleAudio');
const toggleEmotionButton = document.getElementById('toggleEmotion');
const leaveRoomButton = document.getElementById('leaveRoom');

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let localStream;
let peerConnection;
let roomID;
let isVideoEnabled = true;
let isAudioEnabled = true;

async function setupMediaStream() {
    try {
        // First check if permissions are granted
        const permissions = await navigator.permissions.query({ name: 'camera' });
        if (permissions.state === 'denied') {
            throw new Error('Camera permission denied. Please enable camera access in your browser settings.');
        }

        // Request permissions with constraints
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }, 
            audio: true 
        });
        localVideo.srcObject = localStream;
        return true;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert(`Failed to access camera and microphone: ${error.message}\nPlease ensure you have granted camera and microphone permissions.`);
        return false;
    }
}

createRoomButton.addEventListener('click', async () => {
    const success = await setupMediaStream();
    if (success) {
        roomID = Math.random().toString(36).substring(2, 7);
        socket.emit('join-room', roomID);
        alert(`Your Room ID is: ${roomID}`);
        startCall();
    }
});

joinRoomButton.addEventListener('click', async () => {
    roomID = roomIdInput.value.trim();
    if (roomID === '') {
        alert('Please enter a valid Room ID');
        return;
    }
    const success = await setupMediaStream();
    if (success) {
        socket.emit('join-room', roomID);
        startCall();
    }
});

// This function will check if emotion detection module is loaded before calling it
async function startCall() {
    roomSelection.style.display = 'none';
    videoCallSection.style.display = 'block';
    
    // Check if emotion detection is available
    if (typeof window.startEmotionDetection === 'function') {
        await window.startEmotionDetection();
    } else {
        console.warn('Emotion detection not available');
        // Hide emotion-related elements if the feature isn't available
        const emotionStats = document.getElementById('emotion-stats');
        const toggleEmotionButton = document.getElementById('toggleEmotion');
        if (emotionStats) emotionStats.style.display = 'none';
        if (toggleEmotionButton) toggleEmotionButton.style.display = 'none';
    }
}

socket.on('user-connected', async (userID) => {
    console.log('User connected:', userID);
    try {
        await createPeerConnection();
        await addLocalTracks();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { roomID, signal: offer });
    } catch (error) {
        console.error('Error during connection:', error);
        alert('Failed to establish connection. Please try again.');
    }
});

socket.on('signal', async ({ signal, senderID }) => {
    try {
        if (!peerConnection) {
            await createPeerConnection();
        }

        if (signal.type === 'offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
            await addLocalTracks();
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('signal', { roomID, signal: answer });
        } 
        else if (signal.type === 'answer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        } 
        else if (signal.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signal));
        }
    } catch (error) {
        console.error('Error handling signal:', error);
    }
});

async function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);
    
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('signal', { 
                roomID, 
                signal: event.candidate 
            });
        }
    };

    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE Connection State:', peerConnection.iceConnectionState);
    };
}

async function addLocalTracks() {
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
}

toggleVideoButton.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            isVideoEnabled = !isVideoEnabled;
            videoTrack.enabled = isVideoEnabled;
            toggleVideoButton.textContent = isVideoEnabled ? 'Toggle Video' : 'Enable Video';
        }
    }
});

toggleAudioButton.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isAudioEnabled = !isAudioEnabled;
            audioTrack.enabled = isAudioEnabled;
            toggleAudioButton.textContent = isAudioEnabled ? 'Toggle Audio' : 'Enable Audio';
        }
    }
});

leaveRoomButton.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    videoCallSection.style.display = 'none';
    roomSelection.style.display = 'block';
    stopEmotionDetection();
    socket.emit('leave-room', roomID);
});

socket.on('user-disconnected', () => {
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject = null;
    }
});