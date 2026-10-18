<?php
namespace App\Models;
use App\Exceptions\BusinessException;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
// R3.11 (donations.md §2.2, D32): a donation row is never changed or deleted; a correction is a new `reversed` row
class Donation extends Model
{
    use BelongsToInstitution,HasFactory;
    public const UPDATED_AT=null;
    protected $fillable=['institution_id','donor_id','fund_id','campaign_id','amount','method','received_on','receipt_no','purpose_note','status','reverses_id','received_by'];
    protected $casts=['received_on'=>'date','created_at'=>'datetime'];
    protected static function booted(): void
    {
        static::updating(fn()=>throw new BusinessException(__('donations.final'),'donation_final',422));
        static::deleting(fn()=>throw new BusinessException(__('donations.final'),'donation_final',422));
    }
}
