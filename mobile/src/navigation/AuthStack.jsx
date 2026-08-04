import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../ui/tokens";
import SignInScreen from "../../app/(auth)/sign-in";
import VerifyScreen from "../../app/(auth)/verify";

const Stack = createNativeStackNavigator();

export default function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="Verify" component={VerifyScreen} />
    </Stack.Navigator>
  );
}
