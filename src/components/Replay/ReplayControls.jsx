import React from 'react';
import { Play, Pause, SkipForward, Scissors, X, ChevronDown } from 'lucide-react';
import styles from './ReplayControls.module.css';

const ReplayControls = ({
    isPlaying,
    speed,
    onPlayPause,
    onForward,
    onJumpTo,
    onSpeedChange,
    onClose
}) => {
    const speeds = [0.1, 0.5, 1, 3, 5, 10];
    const [showSpeedMenu, setShowSpeedMenu] = React.useState(false);

    return (
        <div className={styles.container}>
            <div className={styles.dragHandle}>
                <div className={styles.title}>Replay mode</div>
            </div>

            <div className={styles.controls}>
                <button
                    className={styles.button}
                    onClick={onJumpTo}
                    title="Jump to..."
                >
                    <Scissors size={20} />
                </button>

                <div className={styles.separator} />

                <button
                    className={styles.button}
                    onClick={onPlayPause}
                    title={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>

                <button
                    className={styles.button}
                    onClick={onForward}
                    title="Forward"
                >
                    <SkipForward size={20} />
                </button>

                <div className={styles.speedWrapper}>
                    <button
                        className={`${styles.button} ${styles.speedButton}`}
                        onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                        title="Replay speed"
                    >
                        <span>{speed}x</span>
                        <ChevronDown size={14} />
                    </button>

                    {showSpeedMenu && (
                        <div className={styles.speedMenu}>
                            {speeds.map(s => (
                                <div
                                    key={s}
                                    className={`${styles.speedItem} ${speed === s ? styles.activeSpeed : ''}`}
                                    onClick={() => {
                                        onSpeedChange(s);
                                        setShowSpeedMenu(false);
                                    }}
                                >
                                    {s}x
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className={styles.separator} />

                <button
                    className={`${styles.button} ${styles.closeButton}`}
                    onClick={onClose}
                    title="Exit Replay mode"
                >
                    <X size={20} />
                </button>
            </div>
        </div>
    );
};

export default ReplayControls;
