import { Stack } from "expo-router";

/** Stack for the food-logging modal flow (chooser → photo / barcode / search). */
export default function LogLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
