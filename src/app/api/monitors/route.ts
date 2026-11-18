import { authenticated, sameOrigin } from "@/auth/session";
import { MonitorErrorSchema, ObservationCommandSchema, ObservationStateSchema } from "@/schemas/monitor";
import { MonitorConflict, MonitorInputError, readObservations, saveObservation } from "@/monitors/service";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store"};
function error(kind:"unauthorized"|"forbidden"|"invalid-input"|"conflict"|"unavailable",message:string,status:number){return Response.json(MonitorErrorSchema.parse({error:kind,message}),{status,headers});}
export async function GET(request:Request){
  if(!authenticated(request))return error("unauthorized","Signed-in session required. Sign in to continue.",401);
  try{return Response.json(ObservationStateSchema.parse(await readObservations()),{headers});}catch{return error("unavailable","Stored monitor inputs failed validation.",503);}
}
export async function PUT(request:Request){
  if(!authenticated(request))return error("unauthorized","Signed-in session required. Sign in to continue.",401);
  if(!sameOrigin(request))return error("forbidden","Same-origin request required.",403);
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")return error("invalid-input","JSON body required.",415);
  let input;
  try {
    const reader=request.body?.getReader();if(!reader)throw new Error("Missing body");const chunks:Uint8Array[]=[];let size=0;
    while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>16384){await reader.cancel();throw new Error("Too large");}chunks.push(next.value);}
    input=ObservationCommandSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  }catch{return error("invalid-input","Invalid monitor input (maximum 16KB). Check the fields, dates and quote spread.",400);}
  try{return Response.json(ObservationStateSchema.parse(await saveObservation(input)),{headers});}
  catch(e){if(e instanceof MonitorConflict)return error("conflict",e.message,409);if(e instanceof MonitorInputError)return error("invalid-input",e.message,400);console.error("[monitors] Save failed",e);return error("unavailable","Monitor inputs could not be saved. Reload before retrying.",503);}
}
