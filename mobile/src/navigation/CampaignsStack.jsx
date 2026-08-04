import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../ui/tokens";
import CampaignsListScreen from "../../app/(app)/campaigns/index";
import CampaignDetailScreen from "../../app/(app)/campaigns/[id]";
import CampaignEditScreen from "../../app/(app)/campaigns/edit/[id]";
import CampaignNewStack from "./CampaignNewStack";

const Stack = createNativeStackNavigator();

// The tab shows the list (CampaignsList) and pushing new/detail/edit screens
// keeps the tab bar visible (the outer AppTabs owns the tab bar; this Stack
// only replaces the content area for this one tab).
export default function CampaignsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="CampaignsList" component={CampaignsListScreen} options={{ title: "Campaigns" }} />
      <Stack.Screen name="CampaignDetail" component={CampaignDetailScreen} options={{ title: "Campaign" }} />
      {/* CampaignNewStack owns its own per-step headers, so this screen's
          header is hidden and only the modal presentation is set here. */}
      <Stack.Screen
        name="CampaignNewStack"
        component={CampaignNewStack}
        options={{ presentation: "modal", headerShown: false }}
      />
      <Stack.Screen
        name="CampaignEdit"
        component={CampaignEditScreen}
        options={{ title: "Edit Campaign", presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}
