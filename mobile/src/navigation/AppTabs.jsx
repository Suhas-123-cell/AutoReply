import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../ui/tokens";
import DashboardScreen from "../../app/(app)/dashboard";
import InboxStack from "./InboxStack";
import CampaignsStack from "./CampaignsStack";
import ActivityScreen from "../../app/(app)/activity";
import MoreStack from "./MoreStack";

const ICONS = {
  Dashboard: "grid-outline",
  InboxStack: "chatbubble-outline",
  CampaignsStack: "megaphone-outline",
  Activity: "list-outline",
  MoreStack: "ellipsis-horizontal",
};

const Tab = createBottomTabNavigator();

export default function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name] ?? "ellipse-outline"} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Dashboard" }} />
      <Tab.Screen name="InboxStack" component={InboxStack} options={{ title: "Inbox" }} />
      <Tab.Screen name="CampaignsStack" component={CampaignsStack} options={{ title: "Campaigns" }} />
      <Tab.Screen name="Activity" component={ActivityScreen} options={{ title: "Activity" }} />
      <Tab.Screen name="MoreStack" component={MoreStack} options={{ title: "More" }} />
    </Tab.Navigator>
  );
}
