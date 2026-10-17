<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Http\Requests\Fees\{FeeRefundQueryRequest, FeeRefundRequest, FeeRefundTransitionRequest};
use App\Http\Resources\FeeRefundResource;
use App\Services\FeeRefundService;

class FeeRefundController extends Controller
{
    public function __construct(private FeeRefundService $refunds) {}
    public function index(FeeRefundQueryRequest $request) { return FeeRefundResource::collection($this->refunds->listing($request->validated())); }
    public function refundable(FeeRefundQueryRequest $request) { return response()->json(['success' => true, 'data' => $this->refunds->refundable($request->validated('receipt_no'))]); }
    public function show(int $id) { return new FeeRefundResource($this->refunds->find($id)); }
    public function store(FeeRefundRequest $request) { return (new FeeRefundResource($this->refunds->create($request->validated(), $request->user()->id)))->response()->setStatusCode(201); }
    public function transition(FeeRefundTransitionRequest $request, int $id, string $action) { return new FeeRefundResource($this->refunds->transition($id, $action, $request->user()->id)); }
}
