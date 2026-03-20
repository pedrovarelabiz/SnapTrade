import React from 'react';

interface MasterSwitchProps {
  readonly isEnabled: boolean;
  readonly onToggle: (enabled: boolean) => void;
}

export const MasterSwitch: React.FC<MasterSwitchProps> = ({
  isEnabled,
  onToggle,
}) => {
  const handleChange = (): void => {
    onToggle(!isEnabled);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <label className="toggle">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={handleChange}
        />
        <span className="toggle-slider" />
      </label>
      <span
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: isEnabled ? '#00e676' : '#8b8b9e',
        }}
      >
        {isEnabled ? 'Trading Active' : 'Trading Paused'}
      </span>
    </div>
  );
};
