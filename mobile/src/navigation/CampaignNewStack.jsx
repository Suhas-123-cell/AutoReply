import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../ui/tokens";
import WizardStep1Screen from "../../app/(app)/campaigns/new/index";
import WizardStep2Screen from "../../app/(app)/campaigns/new/step-2";
import WizardStep3Screen from "../../app/(app)/campaigns/new/step-3";
import WizardStep4Screen from "../../app/(app)/campaigns/new/step-4";
import WizardStep5Screen from "../../app/(app)/campaigns/new/step-5";
import PostPickerScreen from "../../app/(app)/campaigns/new/post-picker";

const Stack = createNativeStackNavigator();

// Nested Stack for the 5-step campaign creation wizard, pushed as a modal by
// CampaignsStack. This inner Stack owns the per-step headers so each step
// gets its own title/back button while the whole flow still slides up as
// one sheet.
export default function CampaignNewStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="CampaignNewStep1" component={WizardStep1Screen} options={{ title: "New campaign" }} />
      <Stack.Screen name="CampaignNewStep2" component={WizardStep2Screen} options={{ title: "Keywords" }} />
      <Stack.Screen name="CampaignNewStep3" component={WizardStep3Screen} options={{ title: "Opening DM" }} />
      <Stack.Screen name="CampaignNewStep4" component={WizardStep4Screen} options={{ title: "Reveal message" }} />
      <Stack.Screen name="CampaignNewStep5" component={WizardStep5Screen} options={{ title: "Finish up" }} />
      <Stack.Screen
        name="PostPicker"
        component={PostPickerScreen}
        options={{ title: "Choose a post", presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}
