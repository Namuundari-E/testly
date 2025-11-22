import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCBvs9YLuXTkneBgaxc1ILJJXQpLKiV40E",
  authDomain: "testly-fbb01.firebaseapp.com",
  projectId: "testly-fbb01",
  storageBucket: "testly-fbb01.firebasestorage.app",
  messagingSenderId: "1027577659030",
  appId: "1:1027577659030:web:2643cf2cea85fdc1b54cb7",
  measurementId: "G-MEPS0QV2XR"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);