import React from 'react';
import styles from './Toast.module.css';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

const Toast = ({ message, type = 'error', onClose }) => {
    const icons = {
        error: <AlertCircle size={20} />,
        success: <CheckCircle size={20} />,
        info: <Info size={20} />
    };

    return (
        <div className={`${styles.toast} ${styles[type]}`}>
            <div className={styles.icon}>{icons[type]}</div>
            <div className={styles.message}>{message}</div>
            <button className={styles.closeBtn} onClick={onClose}>
                <X size={16} />
            </button>
        </div>
    );
};

import PropTypes from 'prop-types';

Toast.propTypes = {
    message: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['error', 'success', 'info']),
    onClose: PropTypes.func.isRequired
};

export default Toast;
