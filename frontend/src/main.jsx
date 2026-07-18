import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import DataCollector from './components/DataCollector.jsx';
import './styles.css';

// Visit /?collect=1 to run gesture data collection instead of the game.
const isCollectMode = new URLSearchParams(window.location.search).has('collect');

function Root() {
  if (isCollectMode) {
    const videoRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    return (
      <div style={{ padding: 20 }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: 480, transform: 'scaleX(-1)' }} />
        <canvas ref={canvasRef} style={{ position: 'absolute', top: 20, left: 20, width: 480, transform: 'scaleX(-1)', pointerEvents: 'none' }} />
        <DataCollector videoRef={videoRef} canvasRef={canvasRef} />
      </div>
    );
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
