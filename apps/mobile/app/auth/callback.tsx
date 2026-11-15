import {Redirect} from 'expo-router';
// AuthSession validates state and exchanges the code in the existing provider.
// Handle the registered route without exposing or rendering callback parameters.
export default function AuthCallback(){return <Redirect href="/my-viva"/>}
