import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../ui/tokens";
import MoreMenuScreen from "../../app/(app)/more/index";
import InstagramScreen from "../../app/(app)/more/instagram";
import MembersScreen from "../../app/(app)/more/members";
import UsageScreen from "../../app/(app)/more/usage";
import AccountScreen from "../../app/(app)/more/account";
import OverviewScreen from "../../app/(app)/more/overview";
import DiagnosticsScreen from "../../app/(app)/more/diagnostics";
import NotificationsScreen from "../../app/(app)/more/notifications";
import SecurityScreen from "../../app/(app)/more/security";

const Stack = createNativeStackNavigator();

// Same nested-Stack-inside-a-tab pattern as CampaignsStack: MoreMenu is a
// menu that pushes settings screens while keeping the tab bar visible.
export default function MoreStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="MoreMenu" component={MoreMenuScreen} options={{ title: "More" }} />
      <Stack.Screen name="Instagram" component={InstagramScreen} options={{ title: "Instagram" }} />
      <Stack.Screen name="Members" component={MembersScreen} options={{ title: "Team Members" }} />
      <Stack.Screen name="Usage" component={UsageScreen} options={{ title: "Usage" }} />
      <Stack.Screen name="Account" component={AccountScreen} options={{ title: "Account" }} />
      <Stack.Screen name="Overview" component={OverviewScreen} options={{ title: "Insights" }} />
      <Stack.Screen name="Diagnostics" component={DiagnosticsScreen} options={{ title: "Diagnostics" }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Notifications" }} />
      <Stack.Screen name="Security" component={SecurityScreen} options={{ title: "Security" }} />
    </Stack.Navigator>
  );
}
