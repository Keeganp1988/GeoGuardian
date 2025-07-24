import React from 'react';
import { FlatList, TouchableOpacity, Text, View } from 'react-native';
import { Circle } from '../firebase/services';

interface CircleListProps {
  circles: Circle[];
  activeCircleIndex: number;
  setActiveCircleIndex: (index: number) => void;
  theme: string;
}

const CircleList: React.FC<CircleListProps> = ({ circles, activeCircleIndex, setActiveCircleIndex, theme }) => (
  <FlatList
    horizontal
    data={circles}
    keyExtractor={item => item.id}
    showsHorizontalScrollIndicator={false}
    renderItem={({ item, index }) => (
      <TouchableOpacity
        className={`px-4 py-2 rounded-full mr-2 ${activeCircleIndex === index ? 'bg-primary' : 'bg-secondary dark:bg-dark-secondary'}`}
        onPress={() => setActiveCircleIndex(index)}
      >
        <Text className={`font-semibold ${activeCircleIndex === index ? 'text-primary-foreground' : 'text-secondary-foreground dark:text-dark-secondary-foreground'}`}>
          {item.name}
        </Text>
      </TouchableOpacity>
    )}
    className="mb-2"
  />
);

export default CircleList; 