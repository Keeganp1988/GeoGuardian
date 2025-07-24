import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../contexts/AppContext";

interface CustomHeaderProps {
  title?: string;
  leftComponent?: React.ReactNode;
  centerComponent?: React.ReactNode;
  isTransparent?: boolean;
}

export default function CustomHeader({ title, leftComponent, centerComponent, isTransparent }: CustomHeaderProps) {
  return (
    <>
      <View style={[styles.header, isTransparent && { backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0 }]}>
        <View style={styles.leftSection}>
          {leftComponent ? leftComponent : <Text style={styles.tabTitle}>{title}</Text>}
        </View>

        <View style={styles.centerSection}>
          {centerComponent ? centerComponent : <Text style={styles.appName}>GeoGuardian</Text>}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E293B",
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingTop: 40,
    height: 80,
  },
  leftSection: {
    flex: 1,
    alignItems: "flex-start",
  },
  centerSection: {
    flex: 2,
    alignItems: "center",
  },
  rightSection: {
    flex: 1,
    alignItems: "flex-end",
  },
  tabTitle: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  appName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  profileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  profileInitials: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
  },
  profileInitialsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1E293B",
  },
  closeButton: {
    padding: 4,
  },
  profileSection: {
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  profileImageContainer: {
    marginBottom: 16,
  },
  largeProfileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  largeProfileInitials: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
  },
  largeProfileInitialsText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  userName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1E293B",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: "#64748B",
  },
  menuSection: {
    padding: 20,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: "#1E293B",
    marginLeft: 12,
  },
}); 