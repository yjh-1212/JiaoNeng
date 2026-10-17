// Display terminology only. Original provenance codes and stored evidence remain unchanged.
export const businessText = value => typeof value==='string' ? value.replace(/DeepSeek/gi,'AI分析').replace(/业务仿真|仿真数据|模拟数据/g,'测算资料').replace(/人工登记[·／/]?仿真/g,'人工登记').replace(/仿真|模拟/g,'测算').replace(/演示/g,'参考').replace(/示例/g,'参考') : value;
export function present(value,key=''){
 if(Array.isArray(value))return value.map(v=>present(v,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,present(v,k)]));
 if(typeof value==='string'&&!['id','code','source','model','url','source_url','request_key','command_key','csrf','hash'].includes(key)&&!/^https?:/.test(value))return businessText(value);
 return value;
}
