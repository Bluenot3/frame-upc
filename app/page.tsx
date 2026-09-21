import {getChatGPTUser,chatGPTSignInPath} from './chatgpt-auth';
import Studio from './studio';
export const dynamic='force-dynamic';
export default async function Home(){const user=await getChatGPTUser();
  if(!user)return <main className="sign-in"><div className="brand-mark">F</div><h1>FrameScan Order Studio</h1><p>Sign in to capture patient orders and open your saved workspace on any device.</p><a className="button primary" href={chatGPTSignInPath('/')} target="_top">Sign in with ChatGPT</a><small>Private workspace · Camera images stay on your device</small></main>;
  return <Studio userName={user.displayName}/>;
}
