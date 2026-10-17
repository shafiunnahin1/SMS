<?php
namespace App\Http\Middleware;
use Closure;
use Illuminate\Http\Request;
class SalarySensitiveScope
{
    public function handle(Request $request,Closure $next)
    {
        if($request->is('api/v1/hr/salary-components*','api/v1/hr/revisions*','api/v1/hr/increment-batches*','api/v1/hr/bonus-schemes*',
            'api/v1/hr/people/*/*/salary','api/v1/hr/people/*/*/pay-accounts')){
            return app(SessionBearer::class)->handle($request,function($request)use($next){
            $user=auth('sanctum')->user();
            if($user && ($user->role==='super_admin' || in_array('impersonated',$user->currentAccessToken()?->abilities??[],true))){
                return response()->json(['success'=>false,'error'=>'sensitive_scope','message'=>__('salary.sensitive')],403);
            }
            return $next($request);
            });
        }
        return $next($request);
    }
}
