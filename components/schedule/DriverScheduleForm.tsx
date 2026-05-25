import DayPicker from '@/components/schedule/DayPicker';
import TimeDropdown from '@/components/schedule/TimeDropdown';
import React from 'react';
import { Text } from 'react-native';
import { styles } from '@/app/(tabs)/history.styles';

interface DriverScheduleFormProps {
  days: string[];
  startTime: string;
  setStartTime: (value: string) => void;
  endTime: string;
  setEndTime: (value: string) => void;
  showStartDropdown: boolean;
  setShowStartDropdown: (show: boolean) => void;
  showEndDropdown: boolean;
  setShowEndDropdown: (show: boolean) => void;
  onToggleDay: (day: string) => void;
}

export default function DriverScheduleForm({
  days,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  showStartDropdown,
  setShowStartDropdown,
  showEndDropdown,
  setShowEndDropdown,
  onToggleDay,
}: DriverScheduleFormProps) {
  return (
    <>
      <Text style={styles.fieldLabel}>Days of the Week</Text>
      <DayPicker selected={days} onToggle={onToggleDay} />
      <TimeDropdown
        label="Available From"
        value={startTime}
        show={showStartDropdown}
        onToggle={() => setShowStartDropdown(!showStartDropdown)}
        onSelect={(t) => {
          setStartTime(t);
          setShowStartDropdown(false);
        }}
      />
      <TimeDropdown
        label="Available Until"
        value={endTime}
        show={showEndDropdown}
        onToggle={() => setShowEndDropdown(!showEndDropdown)}
        onSelect={(t) => {
          setEndTime(t);
          setShowEndDropdown(false);
        }}
      />
    </>
  );
}
