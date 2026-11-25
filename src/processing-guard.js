/** Per-pod safety guard for billable API calls.
 * Corporate ingress must enforce authentication and external rate limiting.
 * For multiple EKS replicas move quotas to shared infrastructure.
 */
export function createProcessingGuard({limit=20,periodMs=60000}={}){
  const counters=new Map();
  return {async limit({key='internal'}={}){
    const now=Date.now();
    const bucket=counters.get(key);
    if(!bucket||now>=bucket.resetAt){
      counters.set(key,{count:1,resetAt:now+periodMs});
      if(counters.size>5000)for(const [k,v] of counters)if(now>=v.resetAt)counters.delete(k);
      return {success:true};
    }
    if(bucket.count>=limit)return {success:false};
    bucket.count++;
    return {success:true};
  }};
}
