'use strict';

(function() {

    function BitView(buf) {
        this.buffer = buf;
        this.u8 = new Uint8Array(buf);
    }

    BitView.prototype.getBit = function(idx) {
        var v = this.u8[idx >> 3];
        var off = idx & 0x7;
        return (v >> (7-off)) & 1;
    };

    BitView.prototype.setBit = function(idx, val) {
        var off = idx & 0x7;
        if (val) {
            this.u8[idx >> 3] |= (0x80 >> off);
        } else {
            this.u8[idx >> 3] &= ~(0x80 >> off);
        }
    };

    BitView.prototype.getInt12 = function(idx) {
        var bidx = idx/8 | 0;
        var a = this.u8[bidx];
        var b = this.u8[bidx + 1];
        var c = this.u8[bidx + 2];
        var off = idx % 8;
        var abits = 8-off;
        var bbits = Math.min(12-abits, 8);
        var cbits = Math.max(12-abits-bbits, 0);
        var am = ~(0xff << (abits));
        var bm = (0xff << (8-bbits));
        var cm = (0xff << (8-cbits));
        a &= am;
        b &= bm;
        c &= cm;
        return (((a << 16) + (b << 8) + c) >> (12-off)) - 2048;
    };

    BitView.prototype.setInt12 = function(idx, val) {
        val += 2048;
        var bidx = idx/8 | 0;
        var off = idx % 8;
        var v = val << (12-off);
        var a = (v & 0xff0000) >> 16;
        var b = (v & 0x00ff00) >> 8;
        var c = v & 0x0000ff;
        var abits = 8-off;
        var bbits = Math.min(12-abits, 8);
        var cbits = Math.max(12-abits-bbits, 0);
        var am = (0xff << (abits));
        this.u8[bidx] = (this.u8[bidx] & am) + a;
        var bm = ~(0xff << (8-bbits));
        this.u8[bidx+1] = (this.u8[bidx+1] & bm) + b;
        var cm = ~(0xff << (8-cbits));
        this.u8[bidx+2] = (this.u8[bidx+2] & cm) + c;
    };

    BitView.prototype.getInt6 = function(idx) {
        var bidx = idx/8 | 0;
        var a = this.u8[bidx];
        var b = this.u8[bidx + 1];
        var off = idx % 8;
        var abits = 8-off;
        var bbits = Math.max(6-abits, 0);
        var am = ~((0xff << (abits)) + (0xff >> (8-(2-off))));
        var bm = (0xff << (8-bbits));
        a &= am;
        b &= bm;
        return (((a << 8) + b) >> (10-off)) - 32;
    };

    BitView.prototype.setInt6 = function(idx, val) {
        val += 32;
        var bidx = idx/8 | 0;
        var off = idx % 8;
        var v = val << (10-off);
        var a = (v & 0xff00) >> 8;
        var b = (v & 0x00ff);
        var abits = 8-off;
        var bbits = Math.max(6-abits, 0);
        var am = ((0xff << (abits)) + (0xff >> (8-(2-off))));
        this.u8[bidx] = (this.u8[bidx] & am) + a;
        var bm = ~(0xff << (8-bbits));
        this.u8[bidx+1] = (this.u8[bidx+1] & bm) + b;
    };

    BitView.test = function() {
        var buf = new ArrayBuffer(3);
        var bv = new BitView(buf);
        var i,j;
        for (j=0; j<12; j++) {
            for (i=-2048; i<2048; i++) {
                bv.setInt12(j,i);
                if (bv.getInt12(j) != i) {
                    console.log('12-bit prob at', j, i);
                    console.log('expected', i, 'got', bv.getInt12(j));
                    break;
                }
            }
        }
        for (j=0; j<18; j++) {
            for (i=-32; i<32; i++) {
                bv.setInt6(j,i);
                if (bv.getInt6(j) != i) {
                    console.log('6-bit prob at', j, i);
                    console.log('expected', i, 'got', bv.getInt6(j));
                    break;
                }
            }
        }
        return bv;
    };

    //////////////////////////////////////////////////////////////////////
    module.exports = BitView;
    //////////////////////////////////////////////////////////////////////
}).call(this);
