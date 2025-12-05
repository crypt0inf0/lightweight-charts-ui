import React, { useState, useEffect } from 'react';
import styles from './AlertDialog.module.css';
import { X } from 'lucide-react';

const AlertDialog = ({ isOpen, onClose, onSave, initialPrice, theme = 'dark' }) => {
    const [condition, setCondition] = useState('Crossing');
    const [value, setValue] = useState('');

    useEffect(() => {
        if (isOpen && initialPrice) {
            setValue(initialPrice.toString());
        }
    }, [isOpen, initialPrice]);

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.dialog} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Edit alert on</h2>
                    <button className={styles.closeButton} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className={styles.content}>
                    <div className={styles.field}>
                        <label className={styles.label}>Condition</label>
                        <select
                            className={styles.select}
                            value={condition}
                            onChange={(e) => setCondition(e.target.value)}
                        >
                            <option value="Crossing">Crossing</option>
                            <option value="Crossing Up">Crossing Up</option>
                            <option value="Crossing Down">Crossing Down</option>
                            <option value="Greater Than">Greater Than</option>
                            <option value="Less Than">Less Than</option>
                        </select>
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Value</label>
                        <input
                            type="number"
                            className={styles.input}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                        />
                    </div>
                </div>
                <div className={styles.footer}>
                    <button className={`${styles.button} ${styles.cancelButton}`} onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className={`${styles.button} ${styles.saveButton}`}
                        onClick={() => {
                            onSave({ condition, value });
                            onClose();
                        }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertDialog;
