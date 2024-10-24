
// Socket connection
const socket = io();

// DOM Elements
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
const roomIdDisplay = document.getElementById('roomIdDisplay');

// WebRTC Configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Global variables
let localStream;
let peerConnection;
let roomID;
let isVideoEnabled = true;
let isAudioEnabled = true;
let isEmotionDetectionRunning = false;

// Emotion Detection Functions
async function loadModels() {
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
            faceapi.nets.faceExpressionNet.loadFromUri('/models')
        ]);
        console.log('Face detection models loaded');
        return true;
    } catch (error) {
        console.error('Error loading face detection models:', error);
        return false;
    }
}

function createEmotionMeters() {
    const localContainer = document.getElementById('local-emotions');
    const remoteContainer = document.getElementById('remote-emotions');
    
    if (!localContainer || !remoteContainer) return;
    
    localContainer.innerHTML = '';
    remoteContainer.innerHTML = '';
}

function updateEmotionMeters(expressions, isLocal = true) {
    const container = document.getElementById(isLocal ? 'local-emotions' : 'remote-emotions');
    if (!container) return;

    // Sort emotions by value and get top 3
    const sortedEmotions = Object.entries(expressions)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3);

    container.innerHTML = '';
    
    sortedEmotions.forEach(([emotion, value]) => {
        const meterDiv = document.createElement('div');
        meterDiv.className = 'emotion-meter';
        const percentage = Math.round(value * 100);
        meterDiv.innerHTML = `
            <div>${emotion}</div>
            <div>${percentage}%</div>
            <div class="emotion-bar" style="width: ${percentage}%"></div>
        `;
        container.appendChild(meterDiv);
    });
}

async function detectEmotions(video, isLocal = true) {
    if (!video.srcObject || !isEmotionDetectionRunning) return;
    
    try {
        const detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceExpressions();
            
        if (detection) {
            updateEmotionMeters(detection.expressions, isLocal);
            
            if (isLocal) {
                socket.emit('emotion-data', { 
                    roomID, 
                    emotions: detection.expressions 
                });
            }
        }
        
        if (isEmotionDetectionRunning) {
            requestAnimationFrame(() => detectEmotions(video, isLocal));
        }
    } catch (error) {
        console.error('Error detecting emotions:', error);
    }
}

async function startEmotionDetection() {
    const modelsLoaded = await loadModels();
    if (!modelsLoaded) {
        alert('Failed to load emotion detection models');
        return;
    }
    
    createEmotionMeters();
    isEmotionDetectionRunning = true;
    
    detectEmotions(localVideo, true);
}

async function setupMediaStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        localVideo.srcObject = localStream;
        return true;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Failed to access camera and microphone. Please check permissions.');
        return false;
    }
}

createRoomButton.addEventListener('click', async () => {
    const success = await setupMediaStream();
    if (success) {
        roomID = Math.random().toString(36).substring(2, 7);
        roomIdDisplay.textContent = roomID;
        socket.emit('join-room', roomID);
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
        roomIdDisplay.textContent = roomID;
        socket.emit('join-room', roomID);
        startCall();
    }
});

async function startCall() {
    roomSelection.style.display = 'none';
    videoCallSection.style.display = 'block';
    document.getElementById('room-info').style.display = 'block';
    await startEmotionDetection();
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

socket.on('emotion-data', (data) => {
    updateEmotionMeters(data.emotions, false);
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

toggleEmotionButton.addEventListener('click', () => {
    isEmotionDetectionRunning = !isEmotionDetectionRunning;
    toggleEmotionButton.textContent = isEmotionDetectionRunning ? 'Stop Emotion Detection' : 'Start Emotion Detection';
    if (isEmotionDetectionRunning) {
        startEmotionDetection();
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
    document.getElementById('room-info').style.display = 'none';
    isEmotionDetectionRunning = false;
    socket.emit('leave-room', roomID);
});

socket.on('user-disconnected', () => {
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject = null;
    }
});