<?php
namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
class DonationCampaign extends Model
{
    use BelongsToInstitution,HasFactory;
    public $timestamps=false;
    protected $fillable=['institution_id','fund_id','title','goal_amount','starts_on','ends_on','status'];
    protected $casts=['starts_on'=>'date','ends_on'=>'date'];
}
