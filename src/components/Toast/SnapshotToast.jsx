import React from 'react';
import styles from './Toast.module.css';
import { Check } from 'lucide-react';
import PropTypes from 'prop-types';

const SnapshotToast = ({ message, onClose }) => {
    return (
        <div className={styles.snapshotToast}>
            <div className={styles.snapshotContent}>
                <div className={styles.checkIcon}>
                    <Check size={12} strokeWidth={3} />
                </div>
                <span>{message}</span>
                <span className={styles.snapshotIcon}>👍</span>
            </div>
        </div>
    );
};

SnapshotToast.propTypes = {
    message: PropTypes.string.isRequired,
    onClose: PropTypes.func
};

export default SnapshotToast;
