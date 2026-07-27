package com.sareeorder.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;
import androidx.annotation.Nullable;

/** Drag to select a rectangle on top of a screenshot. */
public class SnipCropView extends View {
    private final Paint dimPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF selection = new RectF();
    private float startX;
    private float startY;
    private boolean selecting;

    public SnipCropView(Context context) {
        super(context);
        init();
    }

    public SnipCropView(Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        dimPaint.setColor(Color.parseColor("#99000000"));
        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(4f);
        strokePaint.setColor(Color.parseColor("#FF4F46E5"));
    }

    public boolean hasSelection() {
        return selection.width() >= 24f && selection.height() >= 24f;
    }

    /** Selection in view coordinates. */
    public RectF getSelection() {
        return new RectF(selection);
    }

    public void clearSelection() {
        selecting = false;
        selection.setEmpty();
        invalidate();
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                selecting = true;
                startX = event.getX();
                startY = event.getY();
                selection.set(startX, startY, startX, startY);
                invalidate();
                return true;
            case MotionEvent.ACTION_MOVE:
                if (!selecting) return false;
                selection.set(
                    Math.min(startX, event.getX()),
                    Math.min(startY, event.getY()),
                    Math.max(startX, event.getX()),
                    Math.max(startY, event.getY())
                );
                invalidate();
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                selecting = false;
                invalidate();
                return true;
            default:
                return super.onTouchEvent(event);
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int w = getWidth();
        int h = getHeight();
        if (!hasSelection()) {
            canvas.drawRect(0, 0, w, h, dimPaint);
            return;
        }
        // Dim outside selection
        canvas.drawRect(0, 0, w, selection.top, dimPaint);
        canvas.drawRect(0, selection.bottom, w, h, dimPaint);
        canvas.drawRect(0, selection.top, selection.left, selection.bottom, dimPaint);
        canvas.drawRect(selection.right, selection.top, w, selection.bottom, dimPaint);
        canvas.drawRect(selection, strokePaint);
    }
}
