import React from 'react';
import styles from './Layout.module.css';

const Layout = ({ leftToolbar, topbar, chart, bottomBar, watchlist, optionsPanel, rightToolbar, isLeftToolbarVisible = true }) => {
  return (
    <div className={styles.container}>
      <div className={styles.topbarArea}>
        {topbar}
      </div>
      <div className={styles.mainArea}>
        <div className={`${styles.leftToolbarArea} ${!isLeftToolbarVisible ? styles.leftToolbarHidden : ''}`}>
          {leftToolbar}
        </div>
        <div className={styles.centerArea}>
          <div className={styles.chartArea}>
            {chart}
          </div>
          <div className={styles.bottomBarArea}>
            {bottomBar}
          </div>
        </div>
        {watchlist && (
          <div className={styles.watchlistArea}>
            {watchlist}
          </div>
        )}
        {optionsPanel && (
          <div className={styles.optionsPanelArea}>
            {optionsPanel}
          </div>
        )}
        {rightToolbar && (
          <div className={styles.rightToolbarArea}>
            {rightToolbar}
          </div>
        )}
      </div>
    </div>
  );
};

export default Layout;
