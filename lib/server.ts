import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../app/chatgpt-auth';
export class AppError extends Error{constructor(message:string,public status=400){super(message);}}
export async function identity(request:Request){
  const user=await getChatGPTUser();if(!user)throw new AppError('Sign in to open your saved orders.',401);
  if(request.method!=='GET'&&request.method!=='HEAD'){
    const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new AppError('Open this action from your order workspace.',403);
    if(!request.headers.get('content-type')?.includes('application/json'))throw new AppError('Expected JSON.',415);
  }
  return user.userId;
}
export function database(){if(!env.DB)throw new AppError('Saved records are temporarily unavailable. Keep your draft open and try again.',503);return env.DB;}
export async function body(request:Request){const text=await request.text();if(text.length>250000)throw new AppError('This request is too large.');try{return JSON.parse(text);}catch{throw new AppError('Invalid request.');}}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export function failure(error:unknown){if(error instanceof AppError)return json({error:error.message},error.status);if(String(error).includes('UNIQUE constraint'))return json({error:'That order number already exists. Search for it to update the existing order.'},409);console.error('Order Studio storage request failed.');return json({error:'Could not save or load records. Your draft is still open; please retry.'},503);}
export function orderRow(row:any){return {...row,orderedOn:row.ordered_on,dueOn:row.due_on,createdAt:row.created_at,updatedAt:row.updated_at,owner:undefined,ordered_on:undefined,due_on:undefined,created_at:undefined,updated_at:undefined};}
