import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");
const cardWidth = (width - 48) / 4; // 16px padding on each side + 8px gaps

interface StatsCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  color: string;
}

export default function StatsCard({
  icon,
  value,
  label,
  color,
}: StatsCardProps) {
  return (
    <View style={[styles.card, { width: cardWidth, backgroundColor: '#FFFFFF' }]}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.value, { color: '#1E293B' }]}>{value}</Text>
      <Text style={[styles.label, { color: '#64748B' }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 80,
  },
  iconContainer: {
    marginBottom: 4,
  },
  value: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    textAlign: "center",
  },
});
