import AddressAutocompleteInput from '@/components/AddressAutocompleteInput';
import DayPicker from '@/components/schedule/DayPicker';
import TimeDropdown from '@/components/schedule/TimeDropdown';
import React from 'react';
import { Text } from 'react-native';
import { styles } from '@/app/(tabs)/history.styles';

interface RiderScheduleFormProps {
  pickup: string;
  dropoff: string;
  departureTime: string;
  setDepartureTime: (value: string) => void;
  days: string[];
  showDepartureDropdown: boolean;
  setShowDepartureDropdown: (show: boolean) => void;
  onToggleDay: (day: string) => void;
  onPickupChange: (text: string) => void;
  onPickupSelect: (address: string, lat: number, lng: number) => void;
  onDropoffChange: (text: string) => void;
  onDropoffSelect: (address: string, lat: number, lng: number) => void;
}

export default function RiderScheduleForm({
  pickup,
  dropoff,
  departureTime,
  setDepartureTime,
  days,
  showDepartureDropdown,
  setShowDepartureDropdown,
  onToggleDay,
  onPickupChange,
  onPickupSelect,
  onDropoffChange,
  onDropoffSelect,
}: RiderScheduleFormProps) {
  return (
    <>
      <AddressAutocompleteInput
        label="Pickup Address"
        value={pickup}
        returnKeyType="next"
        placeholder="e.g. 123 Sesame Street, New York"
        onChangeText={onPickupChange}
        onSelect={onPickupSelect}
      />
      <AddressAutocompleteInput
        label="Dropoff Address"
        value={dropoff}
        returnKeyType="done"
        placeholder="e.g. 456 Allen Blvd, New York"
        onChangeText={onDropoffChange}
        onSelect={onDropoffSelect}
      />
      <TimeDropdown
        label="Departure Time"
        value={departureTime}
        show={showDepartureDropdown}
        onToggle={() => setShowDepartureDropdown(!showDepartureDropdown)}
        onSelect={(t) => {
          setDepartureTime(t);
          setShowDepartureDropdown(false);
        }}
      />
      <Text style={styles.fieldLabel}>Days of the Week</Text>
      <DayPicker selected={days} onToggle={onToggleDay} />
    </>
  );
}
